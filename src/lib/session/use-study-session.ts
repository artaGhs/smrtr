"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { GenerationResponseSchema, type Attempt, type Evaluation, type GenerationStatus, type Question, type StudyWorkspaceProps } from "../contracts";
import { sampleLesson, SAMPLE_INPUT } from "../fixtures/sample-lesson";
export function useStudySession():StudyWorkspaceProps {
 const [lesson,setLesson]=useState(sampleLesson);
 const [selectedConceptId,onSelectConcept]=useState(sampleLesson.path[0]);
 const [input,setInput]=useState(SAMPLE_INPUT);
 const [status,setStatus]=useState<GenerationStatus>("idle");
 const [error,setError]=useState<string|null>(null);
 const [attempts,setAttempts]=useState<Attempt[]>([]);
 const active=useRef<{id:string;controller:AbortController}|null>(null);
 const onCancel=useCallback(()=>{active.current?.controller.abort();active.current=null;setStatus("idle")},[]);
 useEffect(()=>()=>active.current?.controller.abort(),[]);
 const onInputChange=(value:string)=>{onCancel();setInput(value);setError(null)};
 const onGenerate=async()=>{
  onCancel();const requestId=crypto.randomUUID();const controller=new AbortController();active.current={id:requestId,controller};setStatus("generating");setError(null);
  try {
   const response=await fetch("/api/generate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({requestId,text:input}),signal:controller.signal});
   const data=await response.json();
   if(active.current?.id!==requestId)return;
   if(!response.ok)throw new Error(typeof data.error==="string"?data.error:"Could not create your study map. Try again.");
   const result=GenerationResponseSchema.parse(data);
   if(result.requestId!==requestId)throw new Error("Generation response did not match this request.");
   setLesson(result.lesson);onSelectConcept(result.lesson.path[0]??result.lesson.concepts[0].id);setStatus("ready");active.current=null;
  }catch(cause){if(active.current?.id!==requestId||controller.signal.aborted)return;setError(cause instanceof Error?cause.message:"Generation failed.");setStatus("error");active.current=null}
 };
 const onAnswer=(question:Question,selectedOptionIds:string[],evaluation:Evaluation)=>setAttempts(previous=>[...previous,{id:crypto.randomUUID(),lessonId:lesson.id,revision:lesson.revision,questionId:question.id,conceptIds:question.conceptIds,selectedOptionIds,correct:evaluation.correct,createdAt:new Date().toISOString()}]);
 return {lesson,selectedConceptId,onSelectConcept,input,onInputChange,onGenerate,onCancel,status,error,attempts,onAnswer,onLoadSample:()=>{onCancel();setLesson(sampleLesson);onSelectConcept(sampleLesson.path[0]);setInput(SAMPLE_INPUT);setError(null)}};
}
