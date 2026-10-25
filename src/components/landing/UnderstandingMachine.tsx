import styles from "./landing.module.css";

export type Subject = "physics" | "biology" | "computer-science";

const examples = {
  physics: {
    formulas: ["F = −kx", "x(t) = A cos(ωt)", "ω = √(k/m)"],
    takeaway: "A push. A pull. A repeating pattern.",
    description: "Formulas enter a simple SMRTR computer and emerge as a moving spring and mass, showing how a restoring force creates an oscillation.",
  },
  biology: {
    formulas: ["stimulus → threshold", "Na⁺ in · K⁺ out", "action potential"],
    takeaway: "See how a signal travels.",
    description: "Lecture terms enter a simple SMRTR computer and emerge as a neuron carrying a signal.",
  },
  "computer-science": {
    formulas: ["enqueue(v)", "O(V + E)", "visit → queue → repeat"],
    takeaway: "One level at a time. Now you see the path.",
    description: "Pseudocode enters a simple SMRTR computer and emerges as a graph explored level by level.",
  },
};

export function UnderstandingMachine({ subject }: { subject: Subject }) {
  const example = examples[subject];
  return <svg className={styles.machineIllustration} viewBox="0 0 1200 320" role="img" aria-labelledby="machine-title machine-desc">
    <title id="machine-title">The SMRTR understanding machine</title>
    <desc id="machine-desc">{example.description}</desc>
    <defs>
      <linearGradient id="formula-fade"><stop stopColor="white" stopOpacity="0" /><stop offset=".17" stopColor="white" /><stop offset=".83" stopColor="white" /><stop offset="1" stopColor="white" stopOpacity="0" /></linearGradient>
      <mask id="formula-mask"><rect x="65" y="93" width="430" height="160" fill="url(#formula-fade)" /></mask>
      <linearGradient id="monitor-glass" x2="1" y2="1"><stop stopColor="#ffffff" /><stop offset="1" stopColor="#f1f5ff" /></linearGradient>
    </defs>

    <g className={styles.diagramInput} data-entrance>
    <text x="240" y="59" textAnchor="middle" className={styles.diagramLabel}>THE COMPLICATED STUFF</text>

    {/* The formulas travel into the screen; the computer hides their exit. */}
    <g mask="url(#formula-mask)" key={`${subject}-input`}>
      {example.formulas.map((formula, index) => <text key={formula} x={110 + index * 35} y={133 + index * 43} className={styles.formulaFeed} style={{ animationDelay: `${index * -2.8}s` }}>{formula}</text>)}
    </g>
    <path d="M391 174h111" fill="none" stroke="#d5ddec" strokeWidth="1.2" strokeDasharray="2 7" />

    </g>

    {/* A familiar computer, with just the SMRTR mark on its screen. */}
    <g className={styles.diagramComputer} data-entrance>
    <ellipse cx="596" cy="267" rx="82" ry="7" fill="#233654" opacity=".05" />
    <g stroke="#92a3c5" strokeWidth="1.4" strokeLinejoin="round">
      <path d="M526 100h139a9 9 0 0 1 9 9v118a9 9 0 0 1-9 9H526a9 9 0 0 1-9-9V109a9 9 0 0 1 9-9Z" fill="#cbd6ef" transform="translate(5 4)" />
      <rect x="514" y="97" width="157" height="139" rx="9" fill="#e6edff" />
      <rect x="526" y="109" width="133" height="100" rx="4" fill="url(#monitor-glass)" />
      <rect className={styles.computerGlow} x="527" y="110" width="131" height="98" rx="3" fill="#4165ed" stroke="none" />
      <path d="M580 237v14h27v-14m-48 24h69l-8-10h-53Z" fill="#dfe6f4" />
      <circle className={styles.computerIndicator} cx="650" cy="222" r="2.5" fill="#4165ed" stroke="none" />
    </g>
    <g fill="#4165ed"><path d="M587 144l13-13m-11 0h11v11" fill="none" stroke="currentColor" style={{ color: "var(--accent)" }} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /><text x="592" y="180" textAnchor="middle" fontSize="29" fontWeight="500" fontFamily="'DM Sans', sans-serif" letterSpacing="-1.5">smrtr</text></g>

    </g>

    {/* A single curved output route makes the direction immediately legible. */}
    <g className={styles.diagramConnection} data-entrance>
    <path d="M686 174c49 0 40 48 89 48" fill="none" stroke="#c4d2f2" strokeWidth="1.4" />
    <path className={styles.outputFlow} d="M686 174c49 0 40 48 89 48" pathLength="100" fill="none" stroke="#4165ed" strokeWidth="3" strokeLinecap="round" strokeDasharray="2 102" />
    <path d="m766 217 9 5-9 5" fill="none" stroke="#90a6db" strokeWidth="1.3" />

    </g>

    {/* One explanatory visual, with no window frame or decorative objects. */}
    <g className={styles.diagramExplanation} data-entrance>
    <text x="953" y="59" textAnchor="middle" className={styles.diagramLabel}>NOW IT CLICKS</text>
    <g key={subject} className={styles.simpleOutput}>
      {subject === "physics" ? <>
        <path d="M810 142v82m-6-78 6-6m-6 18 6-6m-6 18 6-6m-6 18 6-6m-6 18 6-6m-6 18 6-6m-6 18 6-6" fill="none" stroke="#9daac3" strokeWidth="1.3" />
        <path d="M810 232h276" fill="none" stroke="#d8e0ef" strokeWidth="1.3" />
        <path d="M986 117v132" fill="none" stroke="#d5dded" strokeDasharray="3 5" />
        <g className={styles.springStretch}><path d="m810 183 20 0 8-14 14 28 14-28 14 28 14-28 14 28 14-28 14 28 9-14h15" fill="none" stroke="#7899ed" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" /></g>
        <g className={styles.oscillatingMass}><rect x="960" y="153" width="53" height="59" rx="5" fill="#dae4ff" stroke="#99ace1" strokeWidth="1.3" /><path d="M966 159h40" stroke="#f3f6ff" strokeWidth="2" strokeLinecap="round" /><text x="986" y="187" textAnchor="middle" fontFamily="Georgia, serif" fontStyle="italic" fontSize="17" fill="#7189c7">m</text><circle cx="970" cy="218" r="4" fill="#a5b5d9" /><circle cx="1004" cy="218" r="4" fill="#a5b5d9" /></g>
        <path d="M952 133h60m-54-4-6 4 6 4m48-8 6 4-6 4" fill="none" stroke="#9baed9" strokeWidth="1.1" />
      </> : subject === "biology" ? <>
        <g stroke="#91a5d4" strokeWidth="2" fill="none" strokeLinecap="round"><path d="M851 179h196m-189-4-24-31-20-4m39 39-29 9-14 18m47-22-8 31-17 12m215-48 21-29 19-7m-41 36 26 12 15 20m-41-30 9 37 19 13" /></g>
        <path d="M841 165c11-21 38-5 34 14s-32 33-38 8Z" fill="#d8e2ff" stroke="#99afe8" strokeWidth="1.3" /><circle cx="854" cy="178" r="7" fill="#91a9ee" />
        <path d="M886 179h149" stroke="#c8d7fb" strokeWidth="15" strokeDasharray="22 7" strokeLinecap="round" /><circle className={styles.simpleSignal} cx="889" cy="179" r="6" fill="#4165ed" stroke="#4165ed" strokeWidth="1" />
      </> : <>
        <path d="m948 117-64 53m64-53 64 53m-128 0-33 62m33-62 32 62m96-62-32 62m32-62 33 62" fill="none" stroke="#c2d0ef" strokeWidth="1.7" />
        {[[948,117],[884,170],[1012,170],[851,232],[916,232],[980,232],[1045,232]].map(([cx, cy], index) => <g key={index} className={styles.traversalNode} style={{ animationDelay: `${index < 1 ? 0 : index < 3 ? .65 : 1.3}s` }}><circle cx={cx} cy={cy} r="15" fill={index === 0 ? "#acc2ff" : index < 3 ? "#d3dfff" : "#edf2ff"} stroke="#9baedc" strokeWidth="1.2" /><text x={cx} y={cy+4} textAnchor="middle" fill="#758abd" fontSize="11" fontFamily="'DM Sans', sans-serif">{index+1}</text></g>)}
      </>}
      <text x="950" y="289" textAnchor="middle" className={styles.visualTakeaway}>{example.takeaway}</text>
    </g>
    </g>
  </svg>;
}
