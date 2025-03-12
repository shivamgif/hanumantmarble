import React from "react";
import { useRouter } from "next/router";

export function GradientButton({
  className = "",
  label = "Get Your Quotation",
  href,
  ...props
}) {
  const router = useRouter();
  
  const handleClick = () => {
    if (href) {
      router.push(href);
    }
  };

  return (
    <button
      onClick={handleClick}
      className={`gradient-button ${className}`}
      {...props}
    >
      <div className="gradient-background" />
      <div className="gradient-border" />
      <div className="button-content">
        <span>{label}</span>
        <svg 
          className="arrow-icon"
          width="16" 
          height="16" 
          viewBox="0 0 24 24" 
          fill="none" 
          stroke="currentColor" 
          strokeWidth="2" 
          strokeLinecap="round" 
          strokeLinejoin="round"
        >
          <line x1="7" y1="17" x2="17" y2="7" />
          <polyline points="7 7 17 7 17 17" />
        </svg>
      </div>
      <style jsx>{`
        .gradient-button {
          position: relative;
          height: 48px;
          padding: 0 24px;
          overflow: hidden;
          border-radius: 6px;
          border: none;
          background: #1a1a1a;
          cursor: pointer;
          transition: all 0.3s;
        }

        .gradient-background {
          position: absolute;
          inset: 0;
          background: linear-gradient(to right, #a78bfa, #818cf8, #6366f1);
          opacity: 0.7;
          transition: opacity 0.5s;
        }

        .gradient-border {
          position: absolute;
          inset: -2px;
          border-radius: 8px;
          background: linear-gradient(to right, #a78bfa, #818cf8, #6366f1);
          opacity: 0;
          filter: blur(8px);
          transition: all 0.5s;
        }

        .button-content {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          font-weight: 500;
          color: white;
        }

        .arrow-icon {
          transition: transform 0.3s;
        }

        .gradient-button:hover .gradient-background {
          opacity: 0.9;
        }

        .gradient-button:hover .gradient-border {
          opacity: 1;
          filter: blur(4px);
        }

        .gradient-button:hover .arrow-icon {
          transform: translate(2px, -2px);
        }
      `}</style>
    </button>
  );
}
