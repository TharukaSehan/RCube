import { useState, useRef, useCallback, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { useSpring, animated } from '@react-spring/three';
import * as THREE from 'three';
import Webcam from 'react-webcam';

// --- 1. CUBE DATA ---
const faceColors = { U: 'white', D: 'yellow', F: 'green', B: 'blue', R: 'red', L: 'orange' };

// We give every cubelet a unique ID and starting position
const initialCubelets = [];
let idCounter = 0;
for (let x = -1; x <= 1; x++) {
  for (let y = -1; y <= 1; y++) {
    for (let z = -1; z <= 1; z++) {
      initialCubelets.push({ id: idCounter++, position: [x, y, z], rotation: [0, 0, 0] });
    }
  }
}

// --- 2. SINGLE CUBELET COMPONENT ---
function Cubelet({ position, rotation }) {
  const [x, y, z] = position;
  const dark = '#222';
  
  // Paint the outside faces, keep inside faces dark plastic
  const colors = [
    x === 1 ? faceColors.R : dark, x === -1 ? faceColors.L : dark,
    y === 1 ? faceColors.U : dark, y === -1 ? faceColors.D : dark,
    z === 1 ? faceColors.F : dark, z === -1 ? faceColors.B : dark,
  ];

  return (
    <animated.mesh position={position} rotation={rotation}>
      <boxGeometry args={[0.95, 0.95, 0.95]} />
      {colors.map((color, idx) => (
        <meshStandardMaterial key={idx} attach={`material-${idx}`} color={color} />
      ))}
    </animated.mesh>
  );
}

// --- 3. THE 3D CUBE ENGINE ---
function RubiksCube({ moveQueue, currentStep, onMoveComplete }) {
  const [cubelets, setCubelets] = useState(initialCubelets);
  const pivotRef = useRef(new THREE.Group());

  // This hook listens for when the user clicks 'Next' or 'Prev'
  useEffect(() => {
    if (moveQueue.length === 0 || currentStep === 0) return;

    // Get the current move (e.g., "R", "U'", "F2")
    const move = moveQueue[currentStep - 1]; 
    const face = move[0]; // R, L, U, D, F, B
    const isPrime = move.includes("'"); // Counter-clockwise
    const isDouble = move.includes("2"); // 180 degrees

    // 1. Identify which 9 cubelets to spin based on their current coordinates
    const targetCubelets = cubelets.filter(c => {
      if (face === 'R') return Math.round(c.position[0]) === 1;
      if (face === 'L') return Math.round(c.position[0]) === -1;
      if (face === 'U') return Math.round(c.position[1]) === 1;
      if (face === 'D') return Math.round(c.position[1]) === -1;
      if (face === 'F') return Math.round(c.position[2]) === 1;
      if (face === 'B') return Math.round(c.position[2]) === -1;
      return false;
    });

    // 2. Calculate the rotation math
    let angle = (Math.PI / 2) * (isPrime ? 1 : -1);
    if (isDouble) angle *= 2;
    
    // Determine which axis to spin the Ferris Wheel on
    const axis = new THREE.Vector3(
      (face === 'R' || face === 'L') ? 1 : 0,
      (face === 'U' || face === 'D') ? 1 : 0,
      (face === 'F' || face === 'B') ? 1 : 0
    );

    // Note: To keep this snippet clean and avoid complex 3D reparenting bugs, 
    // we instantly apply the math rotation here. For buttery smooth animations,
    // we would wrap this state update in a react-spring definition!
    
    const newCubelets = cubelets.map(c => {
      if (targetCubelets.find(t => t.id === c.id)) {
        // Apply the 3D rotation math to find the new coordinate
        const vec = new THREE.Vector3(...c.position);
        vec.applyAxisAngle(axis, angle);
        return { ...c, position: [Math.round(vec.x), Math.round(vec.y), Math.round(vec.z)] };
      }
      return c;
    });

    setCubelets(newCubelets);
    onMoveComplete();

  }, [currentStep, moveQueue]);

  return (
    <group ref={pivotRef}>
      {cubelets.map(c => <Cubelet key={c.id} position={c.position} rotation={c.rotation} />)}
    </group>
  );
}

// --- 4. SCANNER COMPONENT (Kept exactly as you had it!) ---
// --- NEW: THE SCANNER COMPONENT ---
function Scanner({ onSwitchMode, onSolve }) {
  const webcamRef = useRef(null);
  
  // The exact order Kociemba expects
  const faceOrder = ['Up (White)', 'Right (Red)', 'Front (Green)', 'Down (Yellow)', 'Left (Orange)', 'Back (Blue)'];
  const [currentFaceIndex, setCurrentFaceIndex] = useState(0);
  
  // This array will hold all 54 colors once we are done
  const [allColors, setAllColors] = useState([]);

  const capture = useCallback(async () => {
    const imageSrc = webcamRef.current.getScreenshot();
    
    try {
      // 1. Send photo to Python to extract the 9 colors
      const response = await fetch('http://localhost:8000/process-face', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_base64: imageSrc }), 
      });
      const data = await response.json();
      
      if (data.status === "success") {
        // 2. Add these 9 colors to our master list
        const newColors = [...allColors, ...data.colors];
        setAllColors(newColors);
        
        // 3. Check if we are done with all 6 faces
        if (currentFaceIndex === 5) {
          alert("All 6 faces scanned! Sending to solver...");
          
          // Send all 54 colors to our new /solve endpoint
          const solveResponse = await fetch('http://localhost:8000/solve', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ colors: newColors }), 
          });
          
          const solveData = await solveResponse.json();
          if (solveData.status === "success") {
            alert(`Solution found: ${solveData.moves.join(" ")}`);
            onSolve(solveData.moves); // Pass the moves back to the main App
          } else {
            alert(`Solver Error: ${solveData.message}`);
            // Reset so they can try again
            setAllColors([]);
            setCurrentFaceIndex(0);
          }
        } else {
          // Move to the next face prompt
          setCurrentFaceIndex(currentFaceIndex + 1);
        }
      } else {
        alert("Could not read colors. Try better lighting!");
      }
    } catch (error) {
      console.error(error);
      alert("Connection failed. Is the Python server running?");
    }
  }, [webcamRef, currentFaceIndex, allColors, onSolve]);

  return (
    <div style={{ width: '100vw', height: '100vh', backgroundColor: '#111', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
      <h2>Scan Face: {faceOrder[currentFaceIndex]}</h2>
      <p>Please ensure the center piece matches the color requested.</p>
      
      <div style={{ position: 'relative', width: '300px', height: '300px' }}>
        <Webcam
          audio={false} ref={webcamRef} screenshotFormat="image/jpeg"
          videoConstraints={{ width: 300, height: 300, facingMode: "environment" }}
          style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' }}
        />
        <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gridTemplateRows: 'repeat(3, 1fr)', gap: '4px', padding: '4px', boxSizing: 'border-box' }}>
          {[...Array(9)].map((_, i) => (
            <div key={i} style={{ border: '2px solid #00ff00', borderRadius: '4px', backgroundColor: 'rgba(0, 255, 0, 0.1)' }}></div>
          ))}
        </div>
      </div>

      <div style={{ marginTop: '30px', display: 'flex', gap: '15px' }}>
        <button onClick={capture} style={btnStyle}>📸 Capture {faceOrder[currentFaceIndex]}</button>
        <button onClick={onSwitchMode} style={{ ...btnStyle, backgroundColor: '#555' }}>Cancel</button>
      </div>
    </div>
  );
}

// --- 5. MAIN APP COMPONENT ---
export default function App() {
  const [appMode, setAppMode] = useState('solve'); 
  const [moves, setMoves] = useState([]);
  const [currentStep, setCurrentStep] = useState(0);

  if (appMode === 'scan') {
    return <Scanner 
      onSwitchMode={() => setAppMode('solve')} 
      onSolve={(solutionMoves) => {
        setMoves(solutionMoves); 
        setCurrentStep(0);       
        setAppMode('solve');     
      }}
    />;
  }

  return (
    <div style={{ width: '100vw', height: '100vh', backgroundColor: '#1e1e1e', position: 'relative' }}>
      
      {/* Top Bar */}
      <div style={{ position: 'absolute', top: '20px', left: '20px', zIndex: 10 }}>
        <button onClick={() => setAppMode('scan')} style={{ padding: '10px', backgroundColor: '#2196F3', color: 'white', borderRadius: '5px' }}>
          📷 Scan Physical Cube
        </button>
      </div>

      {/* Control Panel UI */}
      {moves.length > 0 && (
        <div style={{ position: 'absolute', bottom: '40px', left: '50%', transform: 'translateX(-50%)', zIndex: 10, backgroundColor: 'rgba(0,0,0,0.8)', padding: '20px', borderRadius: '12px', color: 'white', textAlign: 'center' }}>
          <h2>Step: {currentStep} / {moves.length}</h2>
          <p style={{ fontSize: '24px', fontWeight: 'bold' }}>Move: {currentStep < moves.length ? moves[currentStep] : "Solved!"}</p>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={() => setCurrentStep(Math.max(0, currentStep - 1))} disabled={currentStep === 0}>⏮️ Prev</button>
            <button onClick={() => setCurrentStep(Math.min(moves.length, currentStep + 1))} disabled={currentStep === moves.length}>Next ⏭️</button>
          </div>
        </div>
      )}

      {/* The 3D Canvas */}
      <Canvas camera={{ position: [5, 5, 7] }}>
        <ambientLight intensity={0.7} />
        <directionalLight position={[10, 10, 10]} intensity={1.5} />
        <directionalLight position={[-10, -10, -10]} intensity={0.5} />
        
        <RubiksCube 
          moveQueue={moves} 
          currentStep={currentStep} 
          onMoveComplete={() => console.log("Move finished!")} 
        />
        
        <OrbitControls />
      </Canvas>
    </div>
  );
}