import { useState, useRef, useCallback } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import Webcam from 'react-webcam'; // <-- NEW: Import Webcam

// --- 3D CUBE SETUP (Unchanged) ---
const generateCubeletPositions = () => { /* ... (Keep your existing function) ... */ 
  const positions = [];
  for (let x = -1; x <= 1; x++) {
    for (let y = -1; y <= 1; y++) {
      for (let z = -1; z <= 1; z++) {
        positions.push([x, y, z]);
      }
    }
  }
  return positions;
};
const cubeletPositions = generateCubeletPositions();

function Cubelet({ position }) {
  const [x, y, z] = position;
  const darkPlastic = '#222222';
  const faceColors = [
    x === 1 ? 'red' : darkPlastic, x === -1 ? 'orange' : darkPlastic,
    y === 1 ? 'white' : darkPlastic, y === -1 ? 'yellow' : darkPlastic,
    z === 1 ? 'green' : darkPlastic, z === -1 ? 'blue' : darkPlastic,
  ];
  return (
    <mesh position={position}>
      <boxGeometry args={[0.95, 0.95, 0.95]} />
      {faceColors.map((color, index) => (
        <meshStandardMaterial key={index} attach={`material-${index}`} color={color} />
      ))}
    </mesh>
  );
}

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


// --- MAIN APP COMPONENT ---
export default function App() {
  // NEW: State to track if we are scanning or solving
  const [appMode, setAppMode] = useState('solve'); // 'solve' or 'scan'
  
  const [moves, setMoves] = useState(["U", "R2", "F'", "D"]);
  const [currentStep, setCurrentStep] = useState(0);

  // If the app is in 'scan' mode, render the Scanner!
// Inside export default function App()
  if (appMode === 'scan') {
    return <Scanner 
      onSwitchMode={() => setAppMode('solve')} 
      onSolve={(solutionMoves) => {
        setMoves(solutionMoves); // Save the real moves from Python!
        setCurrentStep(0);       // Reset step counter to 0
        setAppMode('solve');     // Switch back to 3D view
      }}
    />;
  }

  // Otherwise, render the 3D Solve mode we already built
  return (
    <div style={{ width: '100vw', height: '100vh', backgroundColor: '#fcfcfc', position: 'relative' }}>
      
      {/* Top Bar for Switching Modes */}
      <div style={{ position: 'absolute', top: '20px', left: '20px', zIndex: 10 }}>
        <button onClick={() => setAppMode('scan')} style={{ ...btnStyle, backgroundColor: '#2196F3' }}>
          📷 Scan Physical Cube
        </button>
      </div>

      {/* The Control Panel UI (Unchanged) */}
      <div style={{ position: 'absolute', bottom: '40px', left: '50%', transform: 'translateX(-50%)', zIndex: 10, backgroundColor: 'rgba(0,0,0,0.7)', padding: '20px', borderRadius: '12px', color: 'white', textAlign: 'center' }}>
        <h2>Step: {currentStep} / {moves.length}</h2>
        <p style={{ fontSize: '24px', fontWeight: 'bold' }}>Move: {currentStep < moves.length ? moves[currentStep] : "Solved!"}</p>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={() => setCurrentStep(Math.max(0, currentStep - 1))} disabled={currentStep === 0} style={btnStyle}>⏮️ Prev</button>
          <button disabled={currentStep === 0 || currentStep === moves.length} style={btnStyle}>🔄 Replay</button>
          <button onClick={() => setCurrentStep(Math.min(moves.length, currentStep + 1))} disabled={currentStep === moves.length} style={btnStyle}>Next ⏭️</button>
        </div>
      </div>

      {/* The 3D Canvas (Unchanged) */}
      <Canvas camera={{ position: [4, 4, 6] }}>
        <ambientLight intensity={0.6} />
        <directionalLight position={[10, 10, 10]} intensity={1.5} />
        <directionalLight position={[-10, -10, -10]} intensity={0.5} />
        {cubeletPositions.map((pos, index) => <Cubelet key={index} position={pos} />)}
        <OrbitControls />
      </Canvas>
    </div>
  );
}

const btnStyle = { padding: '10px 20px', fontSize: '16px', cursor: 'pointer', border: 'none', borderRadius: '6px', backgroundColor: '#4CAF50', color: 'white', fontWeight: 'bold' };