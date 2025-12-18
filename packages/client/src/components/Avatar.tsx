/**
 * Avatar Component
 *
 * Displays a colored circle with user's initial.
 * Color is deterministic based on username for consistency.
 */

interface AvatarProps {
    username: string;
    size?: "sm" | "md" | "lg";
}

const COLORS = [
    "bg-red-500",
    "bg-orange-500",
    "bg-amber-500",
    "bg-yellow-500",
    "bg-lime-500",
    "bg-green-500",
    "bg-emerald-500",
    "bg-teal-500",
    "bg-cyan-500",
    "bg-sky-500",
    "bg-blue-500",
    "bg-indigo-500",
    "bg-violet-500",
    "bg-purple-500",
    "bg-fuchsia-500",
    "bg-pink-500",
    "bg-rose-500",
];

function getColorFromUsername(username: string): string {
    let hash = 0;
    for (let i = 0; i < username.length; i++) {
        hash = username.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % COLORS.length;
    return COLORS[index];
}

const SIZE_CLASSES = {
    sm: "w-8 h-8 text-sm",
    md: "w-10 h-10 text-base",
    lg: "w-12 h-12 text-lg",
};

export default function Avatar({ username, size = "md" }: AvatarProps) {
    const color = getColorFromUsername(username);
    const initial = username.charAt(0).toUpperCase();

    return (
        <div
            className={`${SIZE_CLASSES[size]} ${color} rounded-full flex items-center justify-center text-white font-semibold flex-shrink-0`}
        >
            {initial}
        </div>
    );
}