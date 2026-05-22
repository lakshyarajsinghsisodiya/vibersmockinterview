import React, { useEffect, useState, useRef } from 'react';

const CustomCursor = () => {
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [hovered, setHovered] = useState(false);
  const [visible, setVisible] = useState(false);
  const [ripples, setRipples] = useState([]);
  
  const ringRef = useRef(null);
  const mouseRef = useRef({ x: 0, y: 0 });
  const ringPosRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    // 1. Tracks mouse coordinates
    const handleMouseMove = (e) => {
      mouseRef.current = { x: e.clientX, y: e.clientY };
      setPosition({ x: e.clientX, y: e.clientY });
      
      // Make cursor visible only on the first mouse movement (prevents top-left freeze)
      if (!visible) {
        setVisible(true);
        // Initialize ring position to exact mouse start
        ringPosRef.current = { x: e.clientX, y: e.clientY };
      }
    };

    // 2. Ripple click effect generator
    const handleMouseDown = (e) => {
      if (!visible) return;
      const newRipple = {
        id: Date.now() + Math.random(),
        x: e.clientX,
        y: e.clientY
      };
      setRipples((prev) => [...prev, newRipple]);

      // Remove after 600ms matching animation
      setTimeout(() => {
        setRipples((prev) => prev.filter((r) => r.id !== newRipple.id));
      }, 600);
    };

    // 3. Hover state triggers on all interactive elements
    const handleMouseOver = (e) => {
      const target = e.target;
      const isInteractive = 
        target.tagName === 'BUTTON' || 
        target.tagName === 'A' || 
        target.tagName === 'SELECT' || 
        target.tagName === 'INPUT' || 
        target.tagName === 'TEXTAREA' || 
        target.tagName === 'LABEL' ||
        target.closest('.interactive-card') ||
        target.closest('.btn-primary') ||
        target.closest('.btn-secondary') ||
        target.closest('.toggle-pill') ||
        target.closest('.glass-card') ||
        target.closest('.accordion-trigger') ||
        target.closest('summary');

      if (isInteractive) {
        setHovered(true);
      } else {
        setHovered(false);
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mouseover', handleMouseOver);

    // 4. Lerp trailing animation loop
    let animId;
    const updateRing = () => {
      if (visible) {
        const targetX = mouseRef.current.x;
        const targetY = mouseRef.current.y;
        
        const currentX = ringPosRef.current.x;
        const currentY = ringPosRef.current.y;
        
        // Lerp rate (0.15 is smooth and responsive)
        const nextX = currentX + (targetX - currentX) * 0.15;
        const nextY = currentY + (targetY - currentY) * 0.15;
        
        ringPosRef.current = { x: nextX, y: nextY };
        
        if (ringRef.current) {
          ringRef.current.style.left = `${nextX}px`;
          ringRef.current.style.top = `${nextY}px`;
        }
      }
      
      animId = requestAnimationFrame(updateRing);
    };
    
    animId = requestAnimationFrame(updateRing);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mouseover', handleMouseOver);
      cancelAnimationFrame(animId);
    };
  }, [visible]);

  // Hide cursor on touch devices or before initial mouse move
  if (!visible) return null;

  return (
    <div className={`cursor-wrapper ${hovered ? 'cursor-hover' : ''}`}>
      {/* 1. Inside solid cursor dot */}
      <div 
        className="cursor-dot" 
        style={{ left: `${position.x}px`, top: `${position.y}px` }} 
      />
      {/* 2. Trailing smoothed hollow ring */}
      <div 
        ref={ringRef}
        className="cursor-ring" 
      />
      {/* 3. Ripple burst visual triggers */}
      {ripples.map((ripple) => (
        <div
          key={ripple.id}
          className="click-ripple"
          style={{ left: `${ripple.x}px`, top: `${ripple.y}px` }}
        />
      ))}
    </div>
  );
};

export default CustomCursor;
