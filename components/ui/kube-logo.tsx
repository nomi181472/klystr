'use client';

import { useId } from 'react';
import { cn } from '@/lib/utils';

interface KubeLogoProps {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  ariaLabel?: string;
}

export function KubeLogo({ size = 'md', className, ariaLabel = 'Klystr' }: KubeLogoProps) {
  const reactId = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const glowId = `klystr-glow-${reactId || 'main'}`;
  const softGlowId = `klystr-soft-glow-${reactId || 'main'}`;

  const sizes = {
    xs: 'h-4 w-4',
    sm: 'h-6 w-6',
    md: 'h-9 w-9',
    lg: 'h-16 w-16',
    xl: 'h-24 w-24',
  };

  return (
    <div
      className={cn(
        'relative inline-flex items-center justify-center shrink-0 select-none transition-transform duration-200 hover:scale-105',
        sizes[size],
        className
      )}
      role="img"
      aria-label={ariaLabel}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 200 200"
        className="h-full w-full overflow-visible drop-shadow-sm"
      >
        <defs>
          <filter id={glowId} filterUnits="userSpaceOnUse" x="0" y="0" width="200" height="200">
            <feGaussianBlur stdDeviation="2.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          <filter id={softGlowId} filterUnits="userSpaceOnUse" x="0" y="0" width="200" height="200">
            <feGaussianBlur stdDeviation="5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Square background with Day/Night adaptive fill */}
        <rect
          x="0"
          y="0"
          width="200"
          height="200"
          rx="28"
          ry="28"
          fill="var(--logo-bg, #000000)"
        />

        {/* Subtle inner border */}
        <rect
          x="8"
          y="8"
          width="184"
          height="184"
          rx="22"
          ry="22"
          fill="none"
          stroke="var(--logo-border, rgba(255, 255, 255, 0.15))"
          strokeWidth="0.6"
          opacity="0.15"
        />

        {/* Background ring */}
        <circle
          cx="100"
          cy="100"
          r="78"
          fill="none"
          stroke="var(--logo-fg, #FFFFFF)"
          strokeWidth="0.8"
          opacity="0.15"
        >
          <animate attributeName="r" values="78;82;78" dur="4s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.15;0.08;0.15" dur="4s" repeatCount="indefinite" />
        </circle>

        {/* Subtle brand circle guide track */}
        <circle
          cx="100"
          cy="100"
          r="72"
          fill="none"
          stroke="var(--logo-circle, var(--logo-fg, #FFFFFF))"
          strokeWidth="0.8"
          opacity="0.18"
        />

        {/* Complete Brand Circle — draws smoothly from top (12 o'clock), glowing & syncs with K */}
        <circle
          cx="100"
          cy="100"
          r="72"
          fill="none"
          stroke="var(--logo-circle, var(--logo-fg, #FFFFFF))"
          strokeWidth="2.4"
          strokeDasharray="452.4"
          strokeDashoffset="452.4"
          strokeLinecap="round"
          transform="rotate(-90 100 100)"
          filter={`url(#${glowId})`}
        >
          <animate
            attributeName="stroke-dashoffset"
            values="452.4;0;0;452.4"
            dur="5s"
            repeatCount="indefinite"
            keyTimes="0;0.4;0.75;1"
          />
          <animate
            attributeName="opacity"
            values="0;1;1;0"
            dur="5s"
            repeatCount="indefinite"
            keyTimes="0;0.2;0.75;1"
          />
        </circle>

        {/* Subtle inner ring */}
        <circle
          cx="100"
          cy="100"
          r="55"
          fill="none"
          stroke="var(--logo-fg, #FFFFFF)"
          strokeWidth="0.5"
          opacity="0.1"
        >
          <animate attributeName="r" values="55;58;55" dur="4s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.1;0.05;0.1" dur="4s" repeatCount="indefinite" />
        </circle>

        {/* K LINES */}
        {/* Upper stem: top node -> center */}
        <line
          x1="71.99"
          y1="58"
          x2="72.01"
          y2="100"
          stroke="var(--logo-fg, #FFFFFF)"
          strokeWidth="6"
          strokeLinecap="round"
          filter={`url(#${glowId})`}
          strokeDasharray="42"
          strokeDashoffset="42"
        >
          <animate
            attributeName="stroke-dashoffset"
            values="42;0;0;42"
            dur="5s"
            repeatCount="indefinite"
            keyTimes="0;0.2;0.75;1"
          />
        </line>

        {/* Lower stem: center -> bottom node */}
        <line
          x1="71.99"
          y1="100"
          x2="72.01"
          y2="142"
          stroke="var(--logo-fg, #FFFFFF)"
          strokeWidth="6"
          strokeLinecap="round"
          filter={`url(#${glowId})`}
          strokeDasharray="42"
          strokeDashoffset="42"
        >
          <animate
            attributeName="stroke-dashoffset"
            values="42;0;0;42"
            dur="5s"
            repeatCount="indefinite"
            keyTimes="0;0.22;0.75;1"
          />
        </line>

        {/* Upper arm: center -> upper-right */}
        <line
          x1="72"
          y1="100"
          x2="128"
          y2="58"
          stroke="var(--logo-fg, #FFFFFF)"
          strokeWidth="5"
          strokeLinecap="round"
          filter={`url(#${glowId})`}
          strokeDasharray="70"
          strokeDashoffset="70"
        >
          <animate
            attributeName="stroke-dashoffset"
            values="70;0;0;70"
            dur="5s"
            repeatCount="indefinite"
            keyTimes="0;0.4;0.75;1"
          />
        </line>

        {/* Lower arm: center -> lower-right */}
        <line
          x1="72"
          y1="100"
          x2="128"
          y2="142"
          stroke="var(--logo-fg, #FFFFFF)"
          strokeWidth="5"
          strokeLinecap="round"
          filter={`url(#${glowId})`}
          strokeDasharray="70"
          strokeDashoffset="70"
        >
          <animate
            attributeName="stroke-dashoffset"
            values="70;0;0;70"
            dur="5s"
            repeatCount="indefinite"
            keyTimes="0;0.4;0.75;1"
          />
        </line>

        {/* NODES */}
        {/* Center joint */}
        <circle cx="72" cy="100" r="5" fill="var(--logo-fg, #FFFFFF)" filter={`url(#${softGlowId})`}>
          <animate attributeName="opacity" values="0;1;1;0" dur="5s" repeatCount="indefinite" keyTimes="0;0.08;0.85;1" />
          <animate attributeName="r" values="0;5;5;0" dur="5s" repeatCount="indefinite" keyTimes="0;0.08;0.85;1" />
        </circle>

        {/* Top of stem */}
        <circle cx="72" cy="58" r="4" fill="var(--logo-fg, #FFFFFF)" filter={`url(#${softGlowId})`}>
          <animate attributeName="opacity" values="0;1;1;0" dur="5s" repeatCount="indefinite" keyTimes="0;0.12;0.85;1" />
          <animate attributeName="r" values="0;4;4;0" dur="5s" repeatCount="indefinite" keyTimes="0;0.12;0.85;1" />
        </circle>

        {/* Bottom of stem */}
        <circle cx="72" cy="142" r="4" fill="var(--logo-fg, #FFFFFF)" filter={`url(#${softGlowId})`}>
          <animate attributeName="opacity" values="0;1;1;0" dur="5s" repeatCount="indefinite" keyTimes="0;0.12;0.85;1" />
          <animate attributeName="r" values="0;4;4;0" dur="5s" repeatCount="indefinite" keyTimes="0;0.12;0.85;1" />
        </circle>

        {/* End of upper arm */}
        <circle cx="128" cy="58" r="4" fill="var(--logo-fg, #FFFFFF)" filter={`url(#${softGlowId})`}>
          <animate attributeName="opacity" values="0;1;1;0" dur="5s" repeatCount="indefinite" keyTimes="0;0.18;0.85;1" />
          <animate attributeName="r" values="0;4;4;0" dur="5s" repeatCount="indefinite" keyTimes="0;0.18;0.85;1" />
        </circle>

        {/* End of lower arm */}
        <circle cx="128" cy="142" r="4" fill="var(--logo-fg, #FFFFFF)" filter={`url(#${softGlowId})`}>
          <animate attributeName="opacity" values="0;1;1;0" dur="5s" repeatCount="indefinite" keyTimes="0;0.18;0.85;1" />
          <animate attributeName="r" values="0;4;4;0" dur="5s" repeatCount="indefinite" keyTimes="0;0.18;0.85;1" />
        </circle>

        {/* Floating particles */}
        <circle cx="140" cy="40" r="2" fill="var(--logo-fg, #FFFFFF)" opacity="0">
          <animate attributeName="opacity" values="0;0.6;0" dur="3s" repeatCount="indefinite" begin="0.5s" />
          <animate attributeName="cy" values="50;30;50" dur="3s" repeatCount="indefinite" begin="0.5s" />
          <animate attributeName="cx" values="130;145;130" dur="3s" repeatCount="indefinite" begin="0.5s" />
        </circle>

        <circle cx="160" cy="110" r="1.5" fill="var(--logo-fg, #FFFFFF)" opacity="0">
          <animate attributeName="opacity" values="0;0.5;0" dur="3.5s" repeatCount="indefinite" begin="1s" />
          <animate attributeName="cy" values="110;95;110" dur="3.5s" repeatCount="indefinite" begin="1s" />
          <animate attributeName="cx" values="160;170;160" dur="3.5s" repeatCount="indefinite" begin="1s" />
        </circle>

        <circle cx="45" cy="80" r="1.8" fill="var(--logo-fg, #FFFFFF)" opacity="0">
          <animate attributeName="opacity" values="0;0.4;0" dur="4s" repeatCount="indefinite" begin="2s" />
          <animate attributeName="cy" values="80;65;80" dur="4s" repeatCount="indefinite" begin="2s" />
          <animate attributeName="cx" values="45;35;45" dur="4s" repeatCount="indefinite" begin="2s" />
        </circle>

        {/* Pulse ring */}
        <circle cx="100" cy="100" r="30" fill="none" stroke="var(--logo-fg, #FFFFFF)" strokeWidth="0.8" opacity="0">
          <animate attributeName="r" values="30;80;80" dur="4s" repeatCount="indefinite" begin="1.5s" />
          <animate attributeName="opacity" values="0.4;0;0" dur="4s" repeatCount="indefinite" begin="1.5s" />
        </circle>
      </svg>
    </div>
  );
}
