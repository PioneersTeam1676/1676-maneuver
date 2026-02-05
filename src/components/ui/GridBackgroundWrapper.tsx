import { cn } from "@/lib/utils";

import type { ReactNode } from "react";

interface GridBackgroundWrapperProps {
    fade?: boolean;
    children: ReactNode;
}

const GridBackgroundWrapper = ({ fade, children }: GridBackgroundWrapperProps) => {
    return (
        <section
            className={cn(
                "h-full",
                "[background-size:40px_40px]",
                "[background-image:linear-gradient(to_right,#e4e4e7_1px,transparent_1px),linear-gradient(to_bottom,#e4e4e7_1px,transparent_1px)]",
                "dark:[background-image:linear-gradient(to_right,#262626_1px,transparent_1px),linear-gradient(to_bottom,#262626_1px,transparent_1px)]",
            )}
        >
            {children}
            {
                fade && (
                    <div className="hidden pointer-events-none absolute mt-7 top-[var(--header-height)] left-0 right-0 bottom-0 lg:flex items-center justify-center bg-white [mask-image:radial-gradient(ellipse_at_center,transparent_70%,black)] dark:bg-black"></div>
                )
            }
        </section>
    );
};

export default GridBackgroundWrapper;
