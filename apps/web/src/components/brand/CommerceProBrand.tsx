import { cn } from "@/lib/utils";
import {
    APP_BRAND_PRIMARY,
    PEDIX_PRO_ICON_ASPECT,
    PEDIX_PRO_ICON_PATHS,
    PEDIX_PRO_ICON_VIEWBOX,
} from "@pedidos/shared";

/** Escala do P dentro do squircle (onBrand) — padding ~16% por lado. */
const ON_BRAND_LOGO_SCALE = 0.68;
const ON_BRAND_TX = (152 * (1 - ON_BRAND_LOGO_SCALE)) / 2;
const ON_BRAND_TY = (167 * (1 - ON_BRAND_LOGO_SCALE)) / 2;

type IconProps = {
  size?: number;
  className?: string;
  /** Ícone branco sobre fundo teal (estilo app icon). */
  onBrand?: boolean;
};

export function CommerceProIcon({
  size = 36,
  className,
  onBrand = false,
}: IconProps) {
  const width = size;
  const height = size * PEDIX_PRO_ICON_ASPECT;

  return (
    <svg
      width={width}
      height={height}
      viewBox={PEDIX_PRO_ICON_VIEWBOX}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn(
        "shrink-0",
        !onBrand && "text-[color:var(--brand-logo)]",
        className,
      )}
      aria-hidden
    >
      {onBrand ? (
        <>
          <rect
            x="0"
            y="0"
            width="152"
            height="167"
            rx="28"
            fill={APP_BRAND_PRIMARY}
          />
          <g
            transform={`translate(${ON_BRAND_TX} ${ON_BRAND_TY}) scale(${ON_BRAND_LOGO_SCALE})`}
          >
            {PEDIX_PRO_ICON_PATHS.map((d) => (
              <path key={d.slice(0, 24)} d={d} fill="#FFFFFF" />
            ))}
          </g>
        </>
      ) : (
        PEDIX_PRO_ICON_PATHS.map((d) => (
          <path key={d.slice(0, 24)} d={d} fill="currentColor" />
        ))
      )}
    </svg>
  );
}

type WordmarkProps = {
  className?: string;
  iconSize?: number;
  /** Fundo escuro (ex.: hero do login). */
  onDark?: boolean;
  showIcon?: boolean;
};

export function CommerceProWordmark({
  className,
  iconSize = 40,
  onDark: _onDark = false,
  showIcon = true,
}: WordmarkProps) {
  const textStyle = {
    fontFamily: "'Sora', system-ui, sans-serif",
    fontSize: iconSize * 0.55,
  };

  return (
    <div className={cn("flex items-center gap-3", className)}>
      {showIcon ? <CommerceProIcon size={iconSize} /> : null}
      <div className="leading-none">
        <p
          className="font-bold tracking-tight text-[color:var(--brand-logo)]"
          style={textStyle}
        >
          Pedix
        </p>
        <p
          className="mt-1 font-bold tracking-tight text-[color:var(--brand-logo)]"
          style={textStyle}
        >
          Pro
        </p>
      </div>
    </div>
  );
}
