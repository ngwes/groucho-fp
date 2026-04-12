import { type Step } from "../pipeline/Pipeline.js"
import { resolve } from "node:path";
import {createJiti} from "jiti"

const jiti = createJiti(import.meta.url);

export type DynamicStepModule<L, Ctx> =
    | { default: Step<L, Ctx> }
    | { default: ReadonlyArray<Step<L, Ctx>> }
    | { steps: ReadonlyArray<Step<L, Ctx>> };


export const loadSteps = async <L, Ctx>(paths: string[]): Promise<ReadonlyArray<Step<L, Ctx>>> => {
    
    let steps: Step<L, Ctx>[] = [];

    for(const path of paths){
        const readStep = await jiti.import(resolve(path)) as any;

        const imported = readStep.default ?? readStep.steps

        if(typeof imported === 'function')
            steps.push(imported as Step<L, Ctx>);
        else
        {
            if(Array.isArray(imported))
                steps.push(...imported as Step<L, Ctx>[])
        }
    }   
    return steps;
};