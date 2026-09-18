import type { DrawingElement } from "@/lib/drawing/types";

/**
 * סמלים אדריכליים.
 * הרכיב מצייר גאומטריה בלבד — אין כאן שום מידע עסקי.
 */

interface ShapeProps {
  element: DrawingElement;
  /** צבע ההדגשה כאשר האלמנט משויך לשינוי */
  accent?: string;
  muted?: boolean;
}

const LINE = "var(--color-plan-line)";
const HATCH = "var(--color-plan-hatch)";

export function ElementShape({ element, accent, muted }: ShapeProps) {
  const { x, y, width, height, rotation } = element;
  const cx = x + width / 2;
  const cy = y + height / 2;
  const transform = rotation ? `rotate(${rotation} ${cx} ${cy})` : undefined;
  const opacity = muted ? 0.28 : 1;

  switch (element.type) {
    case "ROOM":
      return (
        <rect
          x={x}
          y={y}
          width={width}
          height={height}
          fill="var(--color-plan-fill)"
          opacity={muted ? 0.4 : 0.75}
        />
      );

    case "WALL":
      return (
        <rect
          x={x}
          y={y}
          width={width}
          height={height}
          fill={accent ?? LINE}
          opacity={opacity}
          transform={transform}
        />
      );

    case "PARTITION":
      return (
        <rect
          x={x}
          y={y}
          width={width}
          height={height}
          fill={accent ?? "#4a5464"}
          opacity={opacity}
          transform={transform}
        />
      );

    case "RAILING":
      return (
        <rect
          x={x}
          y={y}
          width={width}
          height={height}
          fill={accent ?? HATCH}
          opacity={opacity}
        />
      );

    case "DOOR": {
      const horizontal = width >= height;
      const leaf = horizontal ? width : height;
      return (
        <g opacity={opacity} transform={transform}>
          {/* פתח בקיר */}
          <rect x={x} y={y} width={width} height={height} fill="#ffffff" />
          {/* כנף הדלת וקשת הסיבוב */}
          {horizontal ? (
            <>
              <path
                d={`M${x} ${y + height} L${x} ${y + height + leaf}`}
                stroke={accent ?? LINE}
                strokeWidth={4}
                fill="none"
              />
              <path
                d={`M${x} ${y + height + leaf} A ${leaf} ${leaf} 0 0 0 ${x + leaf} ${y + height}`}
                stroke={accent ?? HATCH}
                strokeWidth={2}
                fill="none"
              />
            </>
          ) : (
            <>
              <path
                d={`M${x + width} ${y} L${x + width + leaf} ${y}`}
                stroke={accent ?? LINE}
                strokeWidth={4}
                fill="none"
              />
              <path
                d={`M${x + width + leaf} ${y} A ${leaf} ${leaf} 0 0 1 ${x + width} ${y + leaf}`}
                stroke={accent ?? HATCH}
                strokeWidth={2}
                fill="none"
              />
            </>
          )}
        </g>
      );
    }

    case "WINDOW": {
      const horizontal = width >= height;
      return (
        <g opacity={opacity}>
          <rect x={x} y={y} width={width} height={height} fill="#ffffff" />
          <rect
            x={x}
            y={y}
            width={width}
            height={height}
            fill="none"
            stroke={accent ?? LINE}
            strokeWidth={2}
          />
          {horizontal ? (
            <line
              x1={x}
              y1={cy}
              x2={x + width}
              y2={cy}
              stroke={accent ?? LINE}
              strokeWidth={2}
            />
          ) : (
            <line
              x1={cx}
              y1={y}
              x2={cx}
              y2={y + height}
              stroke={accent ?? LINE}
              strokeWidth={2}
            />
          )}
        </g>
      );
    }

    case "SLIDING_DOOR": {
      const horizontal = width >= height;
      return (
        <g opacity={opacity}>
          <rect x={x} y={y} width={width} height={height} fill="#ffffff" />
          {horizontal ? (
            <>
              <rect x={x} y={y + 2} width={width / 2} height={height / 2 - 2} fill={accent ?? LINE} />
              <rect
                x={x + width / 2}
                y={y + height / 2}
                width={width / 2}
                height={height / 2 - 2}
                fill={accent ?? HATCH}
              />
            </>
          ) : (
            <>
              <rect x={x + 2} y={y} width={width / 2 - 2} height={height / 2} fill={accent ?? LINE} />
              <rect
                x={x + width / 2}
                y={y + height / 2}
                width={width / 2 - 2}
                height={height / 2}
                fill={accent ?? HATCH}
              />
            </>
          )}
        </g>
      );
    }

    case "OUTLET":
      return (
        <g opacity={opacity}>
          <circle cx={cx} cy={cy} r={9} fill="#ffffff" stroke={accent ?? LINE} strokeWidth={2.5} />
          <path
            d={`M${cx - 4.5} ${cy} h9`}
            stroke={accent ?? LINE}
            strokeWidth={2.5}
            strokeLinecap="round"
          />
          <path
            d={`M${cx} ${cy - 9} v-7`}
            stroke={accent ?? LINE}
            strokeWidth={2}
            strokeLinecap="round"
          />
        </g>
      );

    case "SWITCH":
      return (
        <g opacity={opacity}>
          <circle cx={cx} cy={cy} r={7} fill={accent ?? LINE} />
          <path
            d={`M${cx + 5} ${cy - 5} l8 -8`}
            stroke={accent ?? LINE}
            strokeWidth={2.5}
            strokeLinecap="round"
          />
        </g>
      );

    case "LIGHT":
      return (
        <g opacity={opacity}>
          <circle cx={cx} cy={cy} r={10} fill="#ffffff" stroke={accent ?? LINE} strokeWidth={2.5} />
          <path
            d={`M${cx - 7} ${cy - 7} l14 14 M${cx + 7} ${cy - 7} l-14 14`}
            stroke={accent ?? LINE}
            strokeWidth={2}
          />
        </g>
      );

    case "WATER_POINT":
      return (
        <g opacity={opacity}>
          <circle cx={cx} cy={cy} r={9} fill="#ffffff" stroke={accent ?? LINE} strokeWidth={2.5} />
          <circle cx={cx} cy={cy} r={3.5} fill={accent ?? LINE} />
        </g>
      );

    case "DRAIN":
      return (
        <g opacity={opacity}>
          <circle cx={cx} cy={cy} r={10} fill="#ffffff" stroke={accent ?? LINE} strokeWidth={2.5} />
          <path
            d={`M${cx - 10} ${cy} h20 M${cx} ${cy - 10} v20`}
            stroke={accent ?? LINE}
            strokeWidth={2}
          />
        </g>
      );

    case "SANITARY": {
      const label = String(element.metadata?.label ?? "");
      if (label.includes("אסלה")) {
        return (
          <g opacity={opacity}>
            <rect
              x={x}
              y={y}
              width={width}
              height={height * 0.32}
              rx={4}
              fill="#ffffff"
              stroke={accent ?? LINE}
              strokeWidth={2.5}
            />
            <ellipse
              cx={cx}
              cy={y + height * 0.66}
              rx={width * 0.42}
              ry={height * 0.32}
              fill="#ffffff"
              stroke={accent ?? LINE}
              strokeWidth={2.5}
            />
          </g>
        );
      }
      return (
        <g opacity={opacity}>
          <rect
            x={x}
            y={y}
            width={width}
            height={height}
            rx={8}
            fill="#ffffff"
            stroke={accent ?? LINE}
            strokeWidth={2.5}
          />
          <ellipse
            cx={cx}
            cy={cy}
            rx={width * 0.32}
            ry={height * 0.28}
            fill="none"
            stroke={accent ?? HATCH}
            strokeWidth={2}
          />
        </g>
      );
    }

    case "KITCHEN_UNIT":
      return (
        <rect
          x={x}
          y={y}
          width={width}
          height={height}
          fill="#ffffff"
          stroke={accent ?? HATCH}
          strokeWidth={2.5}
          opacity={opacity}
        />
      );

    case "HVAC":
      return (
        <g opacity={opacity}>
          <rect
            x={x}
            y={y}
            width={width}
            height={height}
            rx={3}
            fill="#ffffff"
            stroke={accent ?? LINE}
            strokeWidth={2.5}
          />
          {[0.25, 0.5, 0.75].map((ratio) => (
            <line
              key={ratio}
              x1={x + width * ratio}
              y1={y + 3}
              x2={x + width * ratio}
              y2={y + height - 3}
              stroke={accent ?? HATCH}
              strokeWidth={2}
            />
          ))}
        </g>
      );

    case "COMMUNICATION":
      return (
        <g opacity={opacity}>
          <circle cx={cx} cy={cy} r={9} fill="#ffffff" stroke={accent ?? LINE} strokeWidth={2.5} />
          <path
            d={`M${cx - 4.5} ${cy + 3.5} l4.5 -7.5 l4.5 7.5 z`}
            fill={accent ?? LINE}
          />
        </g>
      );

    default:
      return null;
  }
}

/** סדר הציור — כדי שהסמלים יופיעו מעל הקירות */
export const DRAW_ORDER: Record<string, number> = {
  ROOM: 0,
  WALL: 1,
  PARTITION: 2,
  RAILING: 3,
  KITCHEN_UNIT: 4,
  SANITARY: 5,
  DOOR: 6,
  WINDOW: 6,
  SLIDING_DOOR: 6,
  HVAC: 7,
  WATER_POINT: 8,
  DRAIN: 8,
  OUTLET: 9,
  SWITCH: 9,
  LIGHT: 9,
  COMMUNICATION: 9,
};
