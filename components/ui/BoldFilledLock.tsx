import React from "react";

interface BoldFilledLockProps {
  size?: number;
  className?: string;
}

export function BoldFilledLock({ size = 16, className = "" }: BoldFilledLockProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M6 8V7C6 3.68629 8.68629 1 12 1C15.3137 1 18 3.68629 18 7V8H19C20.6569 8 22 9.34315 22 11V19C22 20.6569 20.6569 22 19 22H5C3.34315 22 2 20.6569 2 19V11C2 9.34315 3.34315 8 5 8H6ZM8.5 7C8.5 5.067 10.067 3.5 12 3.5C13.933 3.5 15.5 5.067 15.5 7V8H8.5V7ZM12 13C10.8954 13 10 13.8954 10 15C10 15.7403 10.4023 16.3867 11 16.7324V18.5C11 19.0523 11.4477 19.5 12 19.5C12.5523 19.5 13 19.0523 13 18.5V16.7324C13.5977 16.3867 14 15.7403 14 15C14 13.8954 13.1046 13 12 13Z"
      />
    </svg>
  );
}
