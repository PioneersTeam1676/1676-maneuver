import type { ButtonHTMLAttributes } from "react";

export function GoogleButton(
    { className = "", type = "button", ...props }: ButtonHTMLAttributes<HTMLButtonElement>
) {
    return (
        <button
            type={type}
            {...props}
            className={`inline-flex w-full h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium
                                    bg-white text-gray-900 border border-black/10 shadow-sm
                                    hover:bg-gray-50 hover:shadow-md active:bg-gray-100
                                    transition-colors duration-200
                                    focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2
                                    disabled:opacity-50 disabled:pointer-events-none
                                    dark:bg-neutral-900 dark:text-neutral-50 dark:border-white/10
                                    dark:hover:bg-neutral-800 dark:active:bg-neutral-800/80
                                    dark:focus-visible:ring-offset-neutral-900 ${className}`}
        >
            <svg
                className="shrink-0"
                width="18"
                height="18"
                viewBox="0 0 256 262"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
            >
                <path fill="#4285F4" d="M255.5 133.5c0-10.7-.9-18.5-2.8-26.6H130.7v48.1h71.8c-1.4 12.1-9.1 30.2-26.1 42.4l-.2 1.5 37.9 29.4 2.6.3c24-22.2 38.8-54.9 38.8-95.1"/>
                <path fill="#34A853" d="M130.7 261.1c35.7 0 65.7-11.7 87.6-31.9l-41.8-32.4c-11.2 7.8-26.2 13.3-45.8 13.3-34.9 0-64.6-22.3-75.2-53.1l-1.6.1-40.9 31.6-.5 1.5C34.7 231.8 79.7 261.1 130.7 261.1"/>
                <path fill="#FBBC05" d="M55.5 156.9c-2.8-8.1-4.4-16.7-4.4-25.6 0-8.9 1.6-17.5 4.3-25.6l-.1-1.7-41.4-32.1-1.4.6C3.7 89.7 0 109.1 0 129.8c0 20.7 3.7 40.1 10.4 57.2l45.1-35.3"/>
                <path fill="#EB4335" d="M130.7 50.5c24.8 0 41.5 10.7 51.1 19.6l37.3-36.5C196.3 12.7 166.4 0 130.7 0 79.7 0 34.7 29.3 13.6 72l45.6 35.7c10.6-30.8 40.3-57.2 71.5-57.2"/>
            </svg>
            Sign in with Google
        </button>
    );
}
