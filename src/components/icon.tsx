export function Icon({ name, className = "" }: { name: string; className?: string }) {
  return (
    <span aria-hidden className={`material-symbols-rounded text-[20px] ${className}`}>
      {name}
    </span>
  );
}
