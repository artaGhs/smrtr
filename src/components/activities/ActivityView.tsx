"use client";
import type { ActivityViewProps } from "@/lib/contracts";
export function ActivityView({activity}:ActivityViewProps){return <div className="activity-placeholder"><span className="eyebrow">INTERACTIVE LAB · COMING ONLINE</span><p>{activity.kind==="bfs"?"Explore the queue, one discovery at a time.":activity.prompt}</p></div>}
