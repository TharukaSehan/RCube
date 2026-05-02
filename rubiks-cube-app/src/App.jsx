import { useState, useRef, useCallback, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import Webcam from 'react-webcam';
import * as THREE from 'three'; 

// Backend URL: set `VITE_BACKEND_URL` in Vite / Vercel (falls back to localhost for dev)
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';

// --- SHARED STYLES ---
const btnStyle = { padding: '10px 20px', fontSize: '16px', cursor: 'pointer', border: 'none', borderRadius: '6px', backgroundColor: '#4CAF50', color: 'white', fontWeight: 'bold' };

// --- 1. 3D CUBE SETUP (Matrix-Based) ---
const generateInitialCube = () => {
  const cubelets = [];
  let id = 0;
  for (let x = -1; x <= 1; x++) {
    for (let y = -1; y <= 1; y++) {
      for (let z = -1; z <= 1; z++) {
        const darkPlastic = '#222222';
        // Colors are evaluated ONCE at generation, locking them to the piece
        const colors = [
          x === 1 ? 'red' : darkPlastic, x === -1 ? 'orange' : darkPlastic,
          y === 1 ? 'white' : darkPlastic, y === -1 ? 'yellow' : darkPlastic,
          z === 1 ? 'green' : darkPlastic, z === -1 ? 'blue' : darkPlastic,
        ];
        // Create a transformation matrix for the initial position
        const matrix = new THREE.Matrix4().makeTranslation(x, y, z);
        cubelets.push({ id: id++, matrix, colors });
      }
    }
  }
  return cubelets;
};

const invertMove = (moveStr) => {
  if (moveStr.includes('2')) return moveStr;
  return moveStr.includes("'") ? moveStr.replace("'", '') : `${moveStr}'`;
};

const getInverseSequence = (moves) => {
  return [...moves].reverse().map(invertMove);
};

const applyMoveToCubeState = (cubeState, moveStr, inverse = false) => {
  const face = moveStr[0];
  const isPrime = moveStr.includes("'");
  const isDouble = moveStr.includes('2');

  let angle = -Math.PI / 2;
  if (face === 'L' || face === 'D' || face === 'B') angle = Math.PI / 2;

  let finalAngle = angle;
  if (isPrime) finalAngle *= -1;
  if (isDouble) finalAngle *= 2;
  if (inverse) finalAngle *= -1;

  const axis = new THREE.Vector3();
  if (face === 'R' || face === 'L') axis.set(1, 0, 0);
  if (face === 'U' || face === 'D') axis.set(0, 1, 0);
  if (face === 'F' || face === 'B') axis.set(0, 0, 1);

  const rotMatrix = new THREE.Matrix4().makeRotationAxis(axis, finalAngle);

  return cubeState.map((c) => {
    const pos = new THREE.Vector3().setFromMatrixPosition(c.matrix);
    let isOnFace = false;
    const eps = 0.1;
    if (face === 'R' && pos.x > 1 - eps) isOnFace = true;
    if (face === 'L' && pos.x < -1 + eps) isOnFace = true;
    if (face === 'U' && pos.y > 1 - eps) isOnFace = true;
    if (face === 'D' && pos.y < -1 + eps) isOnFace = true;
    if (face === 'F' && pos.z > 1 - eps) isOnFace = true;
    if (face === 'B' && pos.z < -1 + eps) isOnFace = true;

    if (isOnFace) {
      const newMatrix = new THREE.Matrix4().multiplyMatrices(rotMatrix, c.matrix);
      const newPos = new THREE.Vector3().setFromMatrixPosition(newMatrix);
      newPos.x = Math.round(newPos.x);
      newPos.y = Math.round(newPos.y);
      newPos.z = Math.round(newPos.z);
      newMatrix.setPosition(newPos);
      return { ...c, matrix: newMatrix };
    }
    return c;
  });
};

function Cubelet({ matrix, colors }) {
  const meshRef = useRef();

  // Apply the matrix directly to the 3D mesh bypassing React's standard position props
  useEffect(() => {
    if (meshRef.current) {
      meshRef.current.matrix.copy(matrix);
      meshRef.current.matrixAutoUpdate = false;
    }
  }, [matrix]);

  return (
    <mesh ref={meshRef}>
      <boxGeometry args={[0.95, 0.95, 0.95]} />
      {colors.map((color, index) => (
        <meshStandardMaterial key={index} attach={`material-${index}`} color={color} />
      ))}
    </mesh>
  );
}

// --- 2. YOUR SCANNER COMPONENT ---
function Scanner({ onSwitchMode, onSolve }) {
  const webcamRef = useRef(null);
  const faceOrder = ['Up (White)', 'Right (Red)', 'Front (Green)', 'Down (Yellow)', 'Left (Orange)', 'Back (Blue)'];
  const [currentFaceIndex, setCurrentFaceIndex] = useState(0);
  const [allColors, setAllColors] = useState([]);

  const capture = useCallback(async () => {
    const imageSrc = webcamRef.current.getScreenshot();
    
    try {
      const response = await fetch(`${BACKEND_URL}/process-face`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_base64: imageSrc }), 
      });
      const data = await response.json();
      
      if (data.status === "success") {
        const newColors = [...allColors, ...data.colors];
        setAllColors(newColors);
        
        if (currentFaceIndex === 5) {
          alert("All 6 faces scanned! Sending to solver...");
          
          const solveResponse = await fetch(`${BACKEND_URL}/solve`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ colors: newColors }), 
          });
          
          const solveData = await solveResponse.json();
          if (solveData.status === "success") {
            alert(`Solution found: ${solveData.moves.join(" ")}`);
            onSolve(solveData.moves); 
          } else {
            alert(`Solver Error: ${solveData.message}`);
            setAllColors([]);
            setCurrentFaceIndex(0);
          }
        } else {
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
// --- 3. NEW: MANUAL INPUT COMPONENT ---
function ManualInput({ onCancel, onFinish }) {
  const faceNames = ['Up (White)', 'Right (Red)', 'Front (Green)', 'Down (Yellow)', 'Left (Orange)', 'Back (Blue)'];
  const colorMap = { 'W': '#ffffff', 'R': '#ff0000', 'G': '#00ff00', 'Y': '#ffff00', 'O': '#ffa500', 'B': '#0000ff' };
  const colorKeys = ['W', 'R', 'G', 'Y', 'O', 'B'];
  
  const [faceIdx, setFaceIdx] = useState(0);
  const [cubeColors, setCubeColors] = useState(Array(54).fill('W')); 
  const [activeColor, setActiveColor] = useState('R');

  const handleSquareClick = (idx) => {
    const globalIdx = faceIdx * 9 + idx;
    const newColors = [...cubeColors];
    newColors[globalIdx] = activeColor;
    setCubeColors(newColors);
  };

  const handleNext = async () => {
    if (faceIdx < 5) {
      setFaceIdx(faceIdx + 1);
    } else {
      try {
        const response = await fetch(`${BACKEND_URL}/solve`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ colors: cubeColors }),
        });
        const data = await response.json();
        if (data.status === "success") {
          onFinish(data.moves);
        } else {
          alert(`Solver Error: ${data.message}`);
        }
      } catch (err) {
        alert("Connection failed. Is the Python server running?");
      }
    }
  };

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#111', color: 'white', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      <h2>Manual Entry: {faceNames[faceIdx]} Face</h2>
      <p style={{marginBottom: '20px'}}>Select a color, then tap the grid to paint.</p>

      {/* Color Palette */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
        {colorKeys.map(c => (
          <div key={c} onClick={() => setActiveColor(c)} style={{ width: 40, height: 40, backgroundColor: colorMap[c], border: activeColor === c ? '4px solid #fff' : '2px solid #555', cursor: 'pointer', borderRadius: '4px' }} />
        ))}
      </div>

      {/* Paintable Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 80px)', gridTemplateRows: 'repeat(3, 80px)', gap: '5px', marginBottom: '30px' }}>
        {[...Array(9)].map((_, i) => {
          const globalIdx = faceIdx * 9 + i;
          return (
            <div key={i} onClick={() => handleSquareClick(i)} style={{ backgroundColor: colorMap[cubeColors[globalIdx]], border: '2px solid #444', cursor: 'pointer', borderRadius: '4px' }} />
          );
        })}
      </div>

      <div style={{ display: 'flex', gap: '15px' }}>
        <button onClick={() => setFaceIdx(Math.max(0, faceIdx - 1))} disabled={faceIdx === 0} style={{...btnStyle, backgroundColor: '#555'}}>Prev Face</button>
        <button onClick={handleNext} style={{ ...btnStyle, backgroundColor: '#2196F3' }}>
          {faceIdx === 5 ? "Solve Cube!" : "Next Face"}
        </button>
      </div>
      <button onClick={onCancel} style={{ marginTop: '20px', backgroundColor: 'transparent', color: '#aaa', border: 'none', cursor: 'pointer' }}>Cancel</button>
    </div>
  );
}

// --- 4. MAIN APP COMPONENT ---
export default function App() {
  const [appMode, setAppMode] = useState('solve'); // 'solve', 'scan', or 'manual'
  const [moves, setMoves] = useState([]);
  const [currentStep, setCurrentStep] = useState(0);
  const [cubeState, setCubeState] = useState(generateInitialCube);

  const applyMove = useCallback((moveStr, inverse = false) => {
    setCubeState((prevCube) => applyMoveToCubeState(prevCube, moveStr, inverse));
  }, []);

  const handleNext = () => {
    if (currentStep < moves.length) { applyMove(moves[currentStep]); setCurrentStep(currentStep + 1); }
  };
  const handlePrev = () => {
    if (currentStep > 0) { applyMove(moves[currentStep - 1], true); setCurrentStep(currentStep - 1); }
  };
  const handleReplay = () => {
    if (currentStep > 0) {
      applyMove(moves[currentStep - 1], true);
      setTimeout(() => applyMove(moves[currentStep - 1]), 300);
    }
  };

  const handleSolveStart = (solutionMoves) => {
    const initialScrambledCube = getInverseSequence(solutionMoves).reduce(
      (cube, move) => applyMoveToCubeState(cube, move),
      generateInitialCube()
    );

    setMoves(solutionMoves);
    setCurrentStep(0);
    setCubeState(initialScrambledCube);
    setAppMode('solve');
  };

  if (appMode === 'scan') {
    return <Scanner onSwitchMode={() => setAppMode('solve')} onSolve={handleSolveStart} />;
  }
  
  if (appMode === 'manual') {
    return <ManualInput onCancel={() => setAppMode('solve')} onFinish={handleSolveStart} />;
  }

  return (
    <div style={{ width: '100vw', height: '100vh', backgroundColor: '#1e1e1e', position: 'relative' }}>
      
      {/* Top Controls */}
      <div style={{ position: 'absolute', top: '20px', left: '20px', zIndex: 10, display: 'flex', gap: '10px' }}>
        <button onClick={() => setAppMode('scan')} style={{ ...btnStyle, backgroundColor: '#2196F3' }}>📷 Camera Scan</button>
        <button onClick={() => setAppMode('manual')} style={{ ...btnStyle, backgroundColor: '#FF9800' }}>✏️ Manual Entry</button>
      </div>

      {/* Bottom Controls */}
      <div style={{ position: 'absolute', bottom: '40px', left: '50%', transform: 'translateX(-50%)', zIndex: 10, backgroundColor: 'rgba(0,0,0,0.7)', padding: '20px', borderRadius: '12px', color: 'white', textAlign: 'center' }}>
        <h2>Step: {currentStep} / {moves.length}</h2>
        <p style={{ fontSize: '24px', fontWeight: 'bold' }}>Move: {currentStep < moves.length ? moves[currentStep] : (moves.length > 0 ? "Solved!" : "Ready")}</p>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={handlePrev} disabled={currentStep === 0} style={{...btnStyle, backgroundColor: '#555'}}>⏮️ Prev</button>
          <button onClick={handleReplay} disabled={currentStep === 0 || currentStep === moves.length} style={{...btnStyle, backgroundColor: '#555'}}>🔄 Replay</button>
          <button onClick={handleNext} disabled={currentStep === moves.length || moves.length === 0} style={{...btnStyle, backgroundColor: '#555'}}>Next ⏭️</button>
        </div>
      </div>

      {/* 3D Viewer */}
      <Canvas camera={{ position: [4, 4, 6] }}>
        <ambientLight intensity={0.6} />
        <directionalLight position={[10, 10, 10]} intensity={1.5} />
        <directionalLight position={[-10, -10, -10]} intensity={0.5} />
        {cubeState.map((c) => <Cubelet key={c.id} matrix={c.matrix} colors={c.colors} />)}
        <OrbitControls />
      </Canvas>
    </div>
  );
}