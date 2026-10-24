import { useId } from "react";
import { pathTo, type BfsFrame, type BfsTrace } from "../../lib/simulation/bfs";
import { deliveryLayout, knownDistance } from "./scene-model";
import styles from "./canvas.module.css";

export function Parcel({
  label,
  color = "#f3bb70",
  small = false,
}: {
  label?: string;
  color?: string;
  small?: boolean;
}) {
  return (
    <svg
      viewBox="0 0 88 88"
      width={small ? 42 : 76}
      height={small ? 42 : 76}
      aria-hidden="true"
    >
      <path
        d="m44 7 33 18v38L44 82 11 63V25Z"
        fill={color}
        stroke="#4d4038"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="m11 25 33 19 33-19M44 44v38M28 16l33 19v14l-13-7V28"
        fill="none"
        stroke="#4d4038"
        strokeWidth="1.5"
      />
      <path d="m28 16 12-6 33 19-12 7Z" fill="#fff5d7" opacity=".8" />
      {label && (
        <text x="25" y="60" fontSize="19" fontWeight="650" fill="#403731">
          {label.slice(0, 3)}
        </text>
      )}
    </svg>
  );
}

function Building({ kind, color }: { kind: number; color: string }) {
  if (kind % 3 === 0)
    return (
      <g>
        <path
          d="m-35 0 35-23L35 0v39h-70Z"
          fill={color}
          stroke="#414653"
          strokeWidth="1.7"
        />
        <path
          d="m-42 0 42-30L42 0"
          fill="none"
          stroke="#414653"
          strokeWidth="3"
          strokeLinejoin="round"
        />
        <path
          d="M-8 39V13H9v26"
          fill="#fffaf4"
          stroke="#414653"
          strokeWidth="1.5"
        />
        <path
          d="M-25 9h10v12h-10zm41 0h10v12H16z"
          fill="#fffaf4"
          stroke="#414653"
          strokeWidth="1.3"
        />
        <path d="M-42 39h84" stroke="#414653" strokeWidth="2" />
      </g>
    );
  if (kind % 3 === 1)
    return (
      <g>
        <path
          d="M-32-20h64v59h-64Z"
          fill={color}
          stroke="#414653"
          strokeWidth="1.7"
        />
        <path
          d="M-37-20h74v9h-74Z"
          fill="#fffaf4"
          stroke="#414653"
          strokeWidth="1.7"
        />
        <path
          d="M-17 39V18h34v21M-20-1h10v10h-10zm30 0h10v10H10z"
          fill="#fffaf4"
          stroke="#414653"
          strokeWidth="1.5"
        />
        <path d="M-42 39h84" stroke="#414653" strokeWidth="2" />
      </g>
    );
  return (
    <g>
      <path
        d="M-28-35h56v74h-56Z"
        fill={color}
        stroke="#414653"
        strokeWidth="1.7"
      />
      <path
        d="M-34-35h68v7h-68Z"
        fill="#fffaf4"
        stroke="#414653"
        strokeWidth="1.5"
      />
      {[-16, 6].map((x) =>
        [-16, 4].map((y) => (
          <path
            key={`${x}-${y}`}
            d={`M${x} ${y}h10v11h-10z`}
            fill="#fffaf4"
            stroke="#414653"
            strokeWidth="1.2"
          />
        )),
      )}
      <path
        d="M-7 39V23H8v16M-38 39h76"
        fill="#fffaf4"
        stroke="#414653"
        strokeWidth="1.7"
      />
    </g>
  );
}

export function DeliveryMap({
  trace,
  frame,
  focus,
  onInspect,
  target,
}: {
  trace: BfsTrace;
  frame: BfsFrame;
  focus: string;
  onInspect: (node: string) => void;
  target: string;
}) {
  const { positions, layers, height, width, spacing, islandX } =
    deliveryLayout(trace);
  const marker = useId().replace(/:/g, "");
  const route = pathTo(frame, target);
  return (
    <svg
      className={styles.deliveryMap}
      viewBox={`0 0 ${width} ${height}`}
      role="group"
      aria-label="Delivery network. Buildings are graph nodes; every road is one unweighted edge. Select a destination to inspect its route."
    >
      <defs>
        <marker
          id={`road-arrow-${marker}`}
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="5"
          markerHeight="5"
          orient="auto-start-reverse"
        >
          <path d="M0 0 10 5 0 10" fill="#8a94a6" />
        </marker>
      </defs>
      {focus === "layers" &&
        [...layers.keys()].map((layer) => (
          <g key={layer}>
            <rect
              x={95 + layer * spacing - spacing / 2}
              y="100"
              width={spacing}
              height={height - 195}
              rx="65"
              fill={layer % 2 ? "#e6edff" : "#f0f3fa"}
              opacity=".65"
            />
            <text
              x={95 + layer * spacing}
              y="79"
              textAnchor="middle"
              className={styles.layerLabel}
            >
              {layer === 0
                ? "START"
                : `${layer} ${layer === 1 ? "EDGE" : "EDGES"}`}
            </text>
          </g>
        ))}
      <path
        d="M10 478c151-31 163 25 300-9s215 26 364-11"
        fill="none"
        stroke="#e7ebf3"
        strokeWidth="2"
        strokeDasharray="6 9"
      />
      {trace.unreachable.length > 0 && (
        <g transform={`translate(${islandX - 825},0)`}>
          <path
            d={`M765 140 Q850 90 955 155 L965 ${height - 155} Q855 ${height - 60} 765 ${height - 150} Q735 ${height / 2} 765 140Z`}
            fill="#e8f1fc"
          />
          <path
            d={`M785 170 Q855 135 935 180 L940 ${height - 180} Q855 ${height - 105} 785 ${height - 175} Q755 ${height / 2} 785 170Z`}
            fill="#f8f4e9"
            stroke="#d5dfe9"
          />
          <text
            x="853"
            y={height - 35}
            textAnchor="middle"
            className={styles.islandLabel}
          >
            UNREACHABLE ISLAND
          </text>
          <text
            x="853"
            y={height - 15}
            textAnchor="middle"
            className={styles.mapNote}
          >
            No road from {trace.graph.start}
          </text>
        </g>
      )}
      {trace.graph.edges.map((edge, i) => {
        const a = positions.get(edge.source)!;
        const b = positions.get(edge.target)!;
        if (edge.source === edge.target)
          return (
            <path
              key={i}
              d={`M${a.x - 35} ${a.y}c-80-90 115-95 70 0`}
              className={styles.road}
              markerEnd={
                trace.graph.directed ? `url(#road-arrow-${marker})` : undefined
              }
            />
          );
        const active =
          frame.parents[edge.target] === edge.source ||
          (!trace.graph.directed && frame.parents[edge.source] === edge.target);
        const selected = route?.some(
          (node, at) =>
            at > 0 &&
            ((route[at - 1] === edge.source && node === edge.target) ||
              (!trace.graph.directed &&
                route[at - 1] === edge.target &&
                node === edge.source)),
        );
        const t = 0.57;
        const control = {
          x: (a.x + b.x) / 2,
          y: (a.y + b.y) / 2 + (i % 2 ? 23 : -20),
        };
        const arrow = {
          x: (1 - t) ** 2 * a.x + 2 * (1 - t) * t * control.x + t * t * b.x,
          y:
            (1 - t) ** 2 * (a.y + 26) +
            2 * (1 - t) * t * control.y +
            t * t * (b.y + 26),
        };
        const angle =
          (Math.atan2(
            (1 - t) * (control.y - a.y - 26) + t * (b.y + 26 - control.y),
            (1 - t) * (control.x - a.x) + t * (b.x - control.x),
          ) *
            180) /
          Math.PI;
        return (
          <g key={i}>
            <path
              d={`M${a.x} ${a.y + 26} Q${(a.x + b.x) / 2} ${(a.y + b.y) / 2 + (i % 2 ? 23 : -20)} ${b.x} ${b.y + 26}`}
              stroke={active ? "#a6bdf8" : "#e0e5ef"}
              strokeWidth="15"
              fill="none"
            />
            <path
              d={`M${a.x} ${a.y + 26} Q${(a.x + b.x) / 2} ${(a.y + b.y) / 2 + (i % 2 ? 23 : -20)} ${b.x} ${b.y + 26}`}
              stroke={selected ? "#3865df" : active ? "#8da9e7" : "#acb6c7"}
              strokeWidth={selected ? 3 : 1.8}
              strokeDasharray={selected ? undefined : "5 7"}
              fill="none"
              markerEnd={
                trace.graph.directed ? `url(#road-arrow-${marker})` : undefined
              }
            />
            {trace.graph.directed && (
              <path
                d="M-5-5 2 0-5 5"
                transform={`translate(${arrow.x},${arrow.y}) rotate(${angle})`}
                fill="none"
                stroke={selected ? "#3865df" : "#7e8fa9"}
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}
          </g>
        );
      })}
      {trace.graph.nodes.map((node, i) => {
        const p = positions.get(node)!;
        const discovered = frame.discovered.includes(node);
        const expanded = frame.expanded.includes(node);
        const color =
          frame.current === node
            ? "#ffb6a4"
            : expanded
              ? "#9fb9f7"
              : discovered
                ? "#c7d5fc"
                : ["#f2e9de", "#e7ddf4", "#f9e3b7"][i % 3];
        return (
          <g
            key={node}
            transform={`translate(${p.x},${p.y})`}
            role="button"
            tabIndex={0}
            aria-label={`Destination ${node}, ${expanded ? "expanded" : discovered ? "queued" : "unseen"}${knownDistance(frame, node) !== undefined ? `, ${knownDistance(frame, node)} edges from start` : ""}. Inspect route.`}
            aria-pressed={target === node}
            className={styles.destination}
            onClick={() => onInspect(node)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onInspect(node);
              }
            }}
          >
            <ellipse
              cy="46"
              rx="51"
              ry="15"
              fill={target === node ? "#dce7ff" : "#edf0f5"}
            />
            {target === node && (
              <ellipse
                cy="46"
                rx="56"
                ry="19"
                fill="none"
                stroke="#587ecf"
                strokeDasharray="4 5"
              />
            )}
            <Building kind={node === trace.graph.start ? 1 : i} color={color} />
            {node === trace.graph.start && (
              <g>
                <path
                  d="M0-21v-32h29l-6 9 6 9H0"
                  fill="#3865df"
                  stroke="#414653"
                  strokeWidth="1.3"
                />
                <text x="11" y="-40" fontSize="8" fill="white" fontWeight="700">
                  GO
                </text>
              </g>
            )}
            <text
              y="83"
              textAnchor="middle"
              className={styles.destinationLabel}
            >
              {node.length > 6 ? `${node.slice(0, 5)}…` : node}
            </text>
            <text
              y="105"
              textAnchor="middle"
              className={styles.destinationState}
            >
              {frame.current === node
                ? "EXPANDING NOW"
                : expanded
                  ? "✓ expanded"
                  : discovered
                    ? "in the queue"
                    : p.layer === null
                      ? "not reachable"
                      : "not discovered"}
            </text>
          </g>
        );
      })}
      <g transform="translate(36 24)" className={styles.roadLegend}>
        <circle r="4" fill="#3865df" />
        <text x="14" y="5" className={styles.mapNote}>
          {trace.graph.directed ? "One-way roads" : "Two-way roads"} · one road
          = one edge
        </text>
      </g>
    </svg>
  );
}

export function Conveyor({
  frame,
  compact = false,
}: {
  frame: BfsFrame;
  compact?: boolean;
}) {
  return (
    <div
      className={`${styles.conveyor} ${compact ? styles.conveyorCompact : ""}`}
    >
      <div className={styles.conveyorHeading}>
        <span>NEXT OUT</span>
        <span>FIFO CONVEYOR</span>
        <span>JOIN HERE</span>
      </div>
      <div className={styles.conveyorDeck}>
        <div
          className={styles.conveyorItems}
          role="list"
          aria-label="FIFO conveyor, front to back"
        >
          {frame.queue.length ? (
            frame.queue.map((node, i) => (
              <div className={styles.parcelStop} key={node} role="listitem">
                <Parcel label={node} color={i === 0 ? "#ffb6a4" : "#c4d2fa"} />
                <strong>{node}</strong>
                <span>{i === 0 ? "expand next" : `waiting ${i}`}</span>
              </div>
            ))
          ) : (
            <div className={styles.conveyorEmpty}>
              All parcels processed. The queue is empty.
            </div>
          )}
        </div>
        <div className={styles.belt}>
          <span>←</span>
          {Array.from({ length: 12 }, (_, i) => (
            <i key={i} />
          ))}
          <span>←</span>
        </div>
      </div>
      <p>New discoveries join the back. The front leaves first.</p>
    </div>
  );
}
