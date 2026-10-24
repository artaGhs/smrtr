"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  useStore,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type {
  BfsActivity,
  LearningCanvasProps,
  SimulationState,
} from "../../lib/contracts";
import { getTeachingPlan } from "../../lib/teaching/sequence";
import {
  evaluateNextExpansion,
  pathTo,
  type BfsTrace,
} from "../../lib/simulation/bfs";
import {
  pageCanvasScenes,
  experimentGraph,
  knownDistance,
  safeBfsTrace,
  teachingViewport,
  type CanvasScene,
} from "./scene-model";
import {
  changeSimulationState,
  normalizeSimulationState,
  resolveScenarioActivity,
} from "./simulation-state";
import { Conveyor, DeliveryMap, Parcel } from "./Illustrations";
import styles from "./canvas.module.css";

type SceneData = Record<string, unknown> & {
  scene: CanvasScene;
  trace: BfsTrace | null;
  step: number;
  target: string;
  onStep: (step: number) => void;
  onTarget: (target: string) => void;
  onOpen: () => void;
  graph: BfsActivity | null;
  variant: string;
  onStart: (node: string) => void;
  onDirected: (value: boolean) => void;
  onVariant: (value: string) => void;
  openingQuestion: string;
  mobile: boolean;
  pageMode: boolean;
};
type TeachingNode = Node<SceneData, "teaching">;
const nodeTypes = { teaching: TeachingScene };

export function LearningCanvas(props: LearningCanvasProps) {
  return (
    <ReactFlowProvider>
      <CanvasBoard
        key={`${props.lesson.id}:${props.lesson.revision}`}
        {...props}
      />
    </ReactFlowProvider>
  );
}
function CanvasBoard(props: LearningCanvasProps) {
  const scenes = useMemo(
    () =>
      pageCanvasScenes(
        props.lesson,
        props.pageScene,
        props.selectedConceptId,
        props.activeSceneIndex,
      ),
    [
      props.lesson,
      props.pageScene,
      props.selectedConceptId,
      props.activeSceneIndex,
    ],
  );
  const scenario = useMemo(
    () => resolveScenarioActivity(props.lesson, props.activityConceptId),
    [props.lesson, props.activityConceptId],
  );
  const teaching = useMemo(() => getTeachingPlan(props.lesson), [props.lesson]);
  const [configurations, setConfigurations] = useState<
    Record<string, SimulationState>
  >({});
  const width = useStore((state) => state.width);
  const height = useStore((state) => state.height);
  const mobile = width > 0 && width < 700;
  const nodes = useMemo<TeachingNode[]>(
    () =>
      scenes.map((scene) => {
        const ownActivity =
          props.pageScene === undefined &&
          !props.activityConceptId &&
          scene.module?.activity.kind === "bfs"
            ? {
                activityConceptId: scene.module.conceptId,
                activity: scene.module.activity,
              }
            : scenario;
        const activity = ownActivity?.activity ?? null;
        const stateKey = ownActivity?.activityConceptId ?? "none";
        const supplied =
          props.simulations !== undefined || props.onSimulationChange
            ? props.simulations?.[stateKey]
            : configurations[stateKey];
        const configuration = activity
          ? normalizeSimulationState(activity, supplied)
          : {
              start: "",
              directed: true,
              variant: "original",
              step: 0,
              target: "",
            };
        const graph = activity
          ? experimentGraph(
              activity,
              configuration.start,
              configuration.directed,
              configuration.variant,
            )
          : null;
        const trace = safeBfsTrace(graph);
        const update = (patch: Partial<SimulationState>) => {
          if (!activity) return;
          if (props.simulations !== undefined || props.onSimulationChange) {
            props.onSimulationChange?.(
              stateKey,
              changeSimulationState(
                activity,
                props.simulations?.[stateKey],
                patch,
              ),
            );
          } else
            setConfigurations((previous) => ({
              ...previous,
              [stateKey]: changeSimulationState(
                activity,
                previous[stateKey],
                patch,
              ),
            }));
        };
        return {
          id: scene.id,
          type: "teaching",
          position: { x: scene.index * 1540, y: scene.index % 2 ? 70 : 0 },
          width: mobile ? 620 : 1320,
          height: mobile ? 1350 : props.pageScene !== undefined ? 850 : 940,
          draggable: false,
          selectable: false,
          focusable: false,
          data: {
            scene,
            trace,
            step: Math.min(configuration.step, (trace?.frames.length ?? 1) - 1),
            target: configuration.target,
            onStep: (step) => update({ step }),
            onTarget: (target) => update({ target }),
            onOpen: () => props.onOpenConcept(scene.concept.id),
            graph,
            variant: configuration.variant,
            onStart: (start) => update({ start }),
            onDirected: (directed) => update({ directed }),
            onVariant: (variant) => update({ variant }),
            openingQuestion: props.pageScene
              ? props.pageScene === "scenario"
                ? (props.lesson.learningDesign?.centralQuestion ??
                  teaching.openingQuestion)
                : ""
              : teaching.openingQuestion,
            mobile,
            pageMode: props.pageScene !== undefined,
          },
        };
      }),
    [
      scenes,
      scenario,
      configurations,
      props.simulations,
      props.onSimulationChange,
      props.pageScene,
      props.activityConceptId,
      props.lesson.learningDesign?.centralQuestion,
      mobile,
      props.onOpenConcept,
      teaching.openingQuestion,
    ],
  );
  const { setViewport, viewportInitialized } = useReactFlow();
  const active = Math.max(
    0,
    Math.min(props.activeSceneIndex, scenes.length - 1),
  );
  useEffect(() => {
    if (!viewportInitialized || !scenes[active] || !width || !height) return;
    void setViewport(
      teachingViewport(active, width, height, mobile, props.pageScene),
      {
        duration: 0,
      },
    );
  }, [
    active,
    viewportInitialized,
    scenes,
    setViewport,
    width,
    height,
    mobile,
    props.pageScene,
  ]);
  const activeData = nodes[active]?.data;
  if (props.pageScene === "none")
    return (
      <div
        className={`${styles.canvas} ${styles.pageCanvas}`}
        aria-label="This page has no simulation"
      />
    );
  return (
    <div
      className={`${styles.canvas} ${props.pageScene !== undefined ? styles.pageCanvas : ""}`}
      aria-label="Interactive teaching canvas"
    >
      <ReactFlow<TeachingNode>
        nodes={nodes}
        nodeTypes={nodeTypes}
        edges={[]}
        minZoom={0.18}
        maxZoom={1.8}
        zoomOnDoubleClick={false}
        panOnScroll
        selectionOnDrag={false}
        onNodeClick={(_, node) => {
          props.onSelectConcept(node.data.scene.concept.id);
          if (props.pageScene === undefined)
            props.onSceneChange(node.data.scene.index);
        }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={24}
          size={1}
          color="#dfe4ed"
        />
        <Controls
          position="bottom-left"
          showInteractive={false}
          onFitView={() => {
            void setViewport(
              teachingViewport(active, width, height, mobile, props.pageScene),
              {
                duration: 0,
              },
            );
          }}
        />
      </ReactFlow>
      <div className={styles.canvasHint}>
        Drag to explore <span>·</span> Scroll to pan <span>·</span> Pinch to
        zoom
      </div>
      {mobile && activeData?.trace && activeData.scene.family !== "concept" && (
        <div
          className={styles.mobilePlayback}
          role="group"
          aria-label="Mobile simulation controls"
        >
          <span className={styles.mobilePanHint}>
            {props.pageScene !== undefined
              ? props.pageScene === "queue"
                ? "Pan to inspect the network · Pinch to zoom"
                : "Pan to inspect the queue · Pinch to zoom"
              : "Pan down to predict · Pinch to zoom"}
          </span>
          <button
            type="button"
            aria-label="Replay canvas BFS"
            disabled={activeData.step === 0}
            onClick={() => activeData.onStep(0)}
          >
            ↺
          </button>
          <div aria-live="polite">
            <span>
              EXPANSION {activeData.step} / {activeData.trace.frames.length - 1}
            </span>
            <strong>
              Queue:{" "}
              {activeData.trace.frames[activeData.step].queue.join(", ") ||
                "empty"}
            </strong>
          </div>
          <button
            type="button"
            disabled={activeData.trace.frames[activeData.step].complete}
            onClick={() => activeData.onStep(activeData.step + 1)}
            aria-label="Next canvas BFS step"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}

function TeachingScene({ data }: NodeProps<TeachingNode>) {
  const { scene, trace, step, graph } = data;
  const isBfs = scene.family !== "concept" && trace && graph;
  return (
    <section
      className={`${styles.scene} ${scene.family === "queue" ? styles.queueScene : ""} ${data.mobile ? styles.mobileScene : ""} ${data.pageMode ? styles.pageScene : ""}`}
      aria-label={`Teaching scene: ${scene.concept.title}`}
    >
      <header className={styles.sceneHeader}>
        <div>
          <span className={styles.sceneNumber}>
            {String(scene.index + 1).padStart(2, "0")} <i />{" "}
            {isBfs ? "A WORKING EXAMPLE" : "FOLLOW THE IDEA"}
          </span>
          <h2>
            {scene.index === 0 && isBfs && data.openingQuestion
              ? data.openingQuestion
              : scene.concept.title}
          </h2>
          <p>{scene.concept.summary}</p>
        </div>
        <button
          type="button"
          className={`nodrag nopan ${styles.openButton}`}
          onClick={(event) => {
            event.stopPropagation();
            data.onOpen();
          }}
        >
          Explore concept <span>↗</span>
        </button>
      </header>
      {isBfs ? (
        <BfsScene data={data} trace={trace} />
      ) : (
        <ConceptScene scene={scene} />
      )}
    </section>
  );
}
function BfsScene({ data, trace }: { data: SceneData; trace: BfsTrace }) {
  const { scene, step, target, graph, variant } = data;
  const frame = trace.frames[step];
  const predictionKey = `${JSON.stringify(graph)}:${step}`;
  // Keys reset prediction state for a new graph or frame without a stale answer flashing.
  return (
    <div className={styles.bfsBody}>
      <div className={`nodrag nopan ${styles.experimentControls}`}>
        <label>
          Start at
          <select
            aria-label="Canvas BFS start node"
            value={graph!.start}
            onChange={(event) => data.onStart(event.target.value)}
          >
            {graph!.nodes.map((node) => (
              <option key={node}>{node}</option>
            ))}
          </select>
        </label>
        <label>
          Roads
          <select
            aria-label="Canvas BFS road direction"
            value={graph!.directed ? "one-way" : "two-way"}
            onChange={(event) =>
              data.onDirected(event.target.value === "one-way")
            }
          >
            <option value="one-way">One-way →</option>
            <option value="two-way">Two-way ↔</option>
          </select>
        </label>
        <label>
          Try a change
          <select
            aria-label="Canvas BFS experiment"
            value={variant}
            onChange={(event) => data.onVariant(event.target.value)}
          >
            <option value="original">Lesson network</option>
            <option value="island">Disconnect one stop</option>
            <option value="return">Add return roads</option>
          </select>
        </label>
      </div>
      <div className={`nodrag nopan ${styles.mapArea}`}>
        <DeliveryMap
          trace={trace}
          frame={frame}
          focus={scene.family}
          target={target}
          onInspect={data.onTarget}
        />
      </div>
      <aside className={styles.marginNotes}>
        {scene.family === "queue" ? (
          <>
            <span className={styles.annotationNumber}>01 → 02</span>
            <h3>
              First in.
              <br />
              First out.
            </h3>
            <p>
              The next building to explore is the parcel at the front of the
              belt.
            </p>
          </>
        ) : scene.family === "discovery" ? (
          <>
            <span className={styles.annotationNumber}>ONE TICKET</span>
            <h3>
              Discovered
              <br />
              means queued.
            </h3>
            <p>
              A stop gets one ticket when it joins the queue. A second road
              never adds it again.
            </p>
            <div className={styles.stamp}>✓ ENQUEUED ONCE</div>
          </>
        ) : scene.family === "layers" ? (
          <>
            <span className={styles.annotationNumber}>0 → 1 → 2</span>
            <h3>
              Near comes
              <br />
              before far.
            </h3>
            <p>
              Each shaded column is one more edge from the start. BFS reaches
              the fewest-edge layer first.
            </p>
          </>
        ) : (
          <>
            <span className={styles.annotationNumber}>THE BIG PICTURE</span>
            <h3>
              A town.
              <br />A network.
            </h3>
            <p>
              Buildings are nodes.
              <br />
              Roads are edges.
              <br />
              Parcels are waiting work.
            </p>
            <div className={styles.smallParcel}>
              <Parcel small />
              <span>
                One parcel per
                <br />
                discovered stop
              </span>
            </div>
          </>
        )}
        <div className={styles.routeNote}>
          <span>ROUTE TO {target}</span>
          <p>
            {pathTo(frame, target)?.join(" → ") ??
              (frame.complete
                ? "No route from this start."
                : "Not discovered yet.")}
          </p>
          {knownDistance(frame, target) !== undefined && (
            <small>
              {knownDistance(frame, target)} edges · unweighted graph
            </small>
          )}
        </div>
      </aside>
      <div className={styles.beltArea}>
        <Conveyor frame={frame} />
      </div>
      <div className={`nodrag nopan ${styles.playback}`}>
        <button
          type="button"
          disabled={step === 0}
          onClick={() => data.onStep(step - 1)}
          aria-label="Previous canvas BFS step"
        >
          ←
        </button>
        <button
          type="button"
          disabled={step === 0}
          onClick={() => data.onStep(0)}
          aria-label="Replay canvas BFS"
        >
          ↺
        </button>
        <div aria-live="polite">
          <span>
            {frame.complete
              ? "ALL REACHABLE STOPS EXPLORED"
              : `EXPANSION ${step} / ${trace.frames.length - 1}`}
          </span>
          <strong>
            {frame.current
              ? `${frame.current} expanded${frame.newlyDiscovered.length ? ` · ${frame.newlyDiscovered.join(", ")} joined the queue` : " · no new discoveries"}`
              : `${trace.graph.start} is queued. Where do we go next?`}
          </strong>
        </div>
        <button
          type="button"
          className={styles.nextStep}
          disabled={frame.complete}
          onClick={() => data.onStep(step + 1)}
          aria-label="Next canvas BFS step"
        >
          Next step →
        </button>
      </div>
      <div className={styles.sceneFootnote}>
        VISUAL ANALOGY · Computed from this lesson’s graph · Alphabetical
        neighbors · Visited on enqueue
      </div>
      <Prediction key={predictionKey} trace={trace} step={step} />
    </div>
  );
}

function Prediction({ trace, step }: { trace: BfsTrace; step: number }) {
  const [prediction, setPrediction] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const frame = trace.frames[step];
  if (frame.complete)
    return (
      <div className={styles.predictionNote}>
        <span>THE SEARCH IS COMPLETE</span>
        <p>
          {trace.unreachable.length
            ? `${trace.unreachable.join(", ")} never entered the queue: no road connects it from ${trace.graph.start}.`
            : `All ${trace.graph.nodes.length} destinations were reached.`}
        </p>
      </div>
    );
  const answer =
    checked && prediction
      ? evaluateNextExpansion(trace, step, prediction)
      : null;
  return (
    <fieldset className={`nodrag nopan ${styles.predictionNote}`}>
      <legend>Pause & predict</legend>
      <p>Which stop leaves the queue next?</p>
      <div>
        {trace.graph.nodes.map((node) => (
          <button
            type="button"
            key={node}
            aria-pressed={prediction === node}
            disabled={checked}
            onClick={() => setPrediction(node)}
          >
            {node}
          </button>
        ))}
      </div>
      <button
        type="button"
        className={styles.checkPrediction}
        disabled={!prediction || checked}
        onClick={() => setChecked(true)}
      >
        Check my prediction ↗
      </button>
      {answer && (
        <p role="status">
          {answer.correct ? "Exactly. " : "Follow the front. "}
          {answer.feedback}
        </p>
      )}
    </fieldset>
  );
}

function ConceptScene({ scene }: { scene: CanvasScene }) {
  const steps =
    scene.module?.activity.kind === "concept"
      ? scene.module.activity.steps
      : [{ title: scene.concept.title, body: scene.concept.summary }];
  const [active, setActive] = useState(0);
  const step = steps[active] ?? steps[0];
  const points = steps.map((_, i) => ({
    x: steps.length === 1 ? 375 : 85 + (i * 580) / (steps.length - 1),
    y: 210 + Math.sin(i * 1.8) * 90,
  }));
  const stepPath = points
    .map((point, i) => `${i ? "L" : "M"}${point.x} ${point.y}`)
    .join(" ");
  return (
    <div className={styles.conceptBody}>
      <div className={styles.conceptOrbit} aria-hidden="true">
        <svg viewBox="0 0 750 420">
          <path
            d={stepPath}
            fill="none"
            stroke="#cbd6ee"
            strokeWidth="3"
            strokeDasharray="9 9"
          />
          {points.map(({ x, y }, i) => (
            <g key={i} transform={`translate(${x},${y})`}>
              <circle
                r={i === active ? 47 : 33}
                fill={
                  i === active
                    ? "#3865df"
                    : ["#f7e7ce", "#e5dff3", "#f7ddd5", "#e0e8f8"][i % 4]
                }
              />
              <text
                textAnchor="middle"
                y="9"
                fill={i === active ? "white" : "#68768e"}
                fontSize="25"
              >
                {String(i + 1).padStart(2, "0")}
              </text>
            </g>
          ))}
        </svg>
        <span className={styles.orbitCaption}>
          One useful step leads to another.
        </span>
      </div>
      <div
        className={`nodrag nopan ${styles.conceptSteps}`}
        role="group"
        aria-label="Explanation steps"
      >
        {steps.map((item, i) => (
          <button
            type="button"
            key={i}
            aria-pressed={active === i}
            onClick={() => setActive(i)}
          >
            <span>{String(i + 1).padStart(2, "0")}</span>
            {item.title}
          </button>
        ))}
      </div>
      <div className={styles.conceptAnnotation} aria-live="polite">
        <span>
          STEP {active + 1} / {steps.length}
        </span>
        <h3>{step.title}</h3>
        <p>{step.body}</p>
      </div>
      {scene.module?.example && (
        <div className={styles.generatedExample}>
          <span>A CONCRETE EXAMPLE</span>
          <p>{scene.module.example}</p>
        </div>
      )}
      <p className={styles.genericNotice}>
        Guided explanation from this lesson · These are explanation steps, not
        an executable simulation.
      </p>
    </div>
  );
}
