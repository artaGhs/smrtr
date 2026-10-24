import { NextResponse } from "next/server";
import { failureFixture } from "@/lib/fixtures/sample-lesson";
export async function POST(){return NextResponse.json(failureFixture,{status:503})}
