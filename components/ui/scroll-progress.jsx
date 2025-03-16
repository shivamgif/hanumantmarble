'use client';
import { useEffect, useState } from 'react';

export function ScrollProgress({ color = 'rgb(255, 92, 2)' }) {
  const [scrollProgress, setScrollProgress] = useState(0);

  useEffect(() => {
    const updateScroll = () => {
      const totalHeight = document.documentElement.scrollHeight - window.innerHeight;
      const progress = (window.scrollY / totalHeight) * 100;
      setScrollProgress(progress);
    };

    window.addEventListener('scroll', updateScroll);
    
    return () => window.removeEventListener('scroll', updateScroll);
  }, []);

  return (
    <div className="fixed top-0 left-0 w-full h-1 z-50">
      <div 
        style={{
          width: `${scrollProgress}%`,
          backgroundColor: color,
          height: '100%',
          transition: 'width 0.2s ease'
        }}
      />
    </div>
  );
}
