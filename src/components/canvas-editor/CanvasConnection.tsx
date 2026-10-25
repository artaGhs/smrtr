'use client';
import { useContext } from 'react';
import { RevealContext } from './RevealContext';
import { BaseEdge, type Edge, type EdgeProps } from '@xyflow/react';
import { roundedConnectionPath, type ConnectionRoute } from '@/lib/canvas-presentation/connections';
import styles from './editor.module.css';

export type CanvasEdge = Edge<{ route: ConnectionRoute; drawing: boolean; related: boolean; reduced: boolean; labelText: string }>;
export function CanvasConnection({ id, data, markerEnd, selected, source, target }: EdgeProps<CanvasEdge>) {
  const phases = useContext(RevealContext);
  if (!data) return null;
  const targetPhase = phases?.[target];
  if (phases && (phases[source] !== 'open' || (targetPhase !== 'open' && !(targetPhase === 'connecting' && !data.related)))) return null;
  const drawing = phases ? targetPhase === 'connecting' : data.drawing;
  const path = roundedConnectionPath(data.route.points);
  return <g className={styles.connection} data-connection-id={id} data-drawing={drawing} data-related={data.related}>
    <title>{data.labelText}</title>
    <BaseEdge id={id} path={path} interactionWidth={20} style={{ stroke: 'transparent' }} />
    <path d={path} pathLength={1} fill="none" stroke={selected ? '#627bc2' : data.related ? '#b4bfd0' : '#a9b7ca'} strokeWidth={selected ? 2.2 : 1.6} markerEnd={drawing && !data.reduced ? undefined : markerEnd} className={drawing && !data.reduced ? styles.drawingPath : undefined} pointerEvents="none" />
    {data.route.label && !drawing && <text className={styles.connectionLabel} x={data.route.label.x} y={data.route.label.y + 12}>
      {data.route.label.lines.map((line, index) => <tspan key={index} x={data.route.label!.x} dy={index ? 17 : 0}>{line}</tspan>)}
    </text>}
  </g>;
}
