/*
 * Copyright 2018-2020 TON Labs LTD.
 *
 * Licensed under the SOFTWARE EVALUATION License (the "License"); you may not use
 * this file except in compliance with the License.  You may obtain a copy of the
 * License at:
 *
 * http://www.ton.dev/licenses
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific TON DEV software governing permissions and
 * limitations under the License.
 */

const sdk = Deno.dlopen(
    "eversdk.deno",
    {
        deno_create_context: {
            parameters: ["buffer"], result: "pointer",
        },
        deno_destroy_context: {
            parameters: ["u32"],
            result: "void",
        },
        deno_request_sync: {
            parameters: ["u32", "buffer", "buffer"],
            result: "pointer",

        },
        deno_request: {
            parameters: ["u32", "buffer", "buffer", "u32"],
            result: "void",

        },
        deno_set_response_callback: {
            parameters: ["function"],
            result: "void",
        },
        deno_clear_response_callback: {
            parameters: [],
            result: "void",
        },
        deno_free_string: {
            parameters: ["pointer"],
            result: "void",
        },
    } as const,
);

let currentCallback: Deno.UnsafeCallback | null = null;

const denoLib = {
    createContext(configJson: string): string {
        const result = sdk.symbols.deno_create_context(stringToPointer(configJson));
        return stringFromPointer(result);
    },
    destroyContext(context: number): void {
        sdk.symbols.deno_destroy_context(context);
    },
    getLibName(): string {
        return "lib-deno";
    },
    requestSync(context: number, functionName: string, functionParamsJson: string): string {
        return stringFromPointer(
            sdk.symbols.deno_request_sync(
                context,
                stringToPointer(functionName),
                stringToPointer(functionParamsJson),
            ),
        );
    },
    sendRequest(context: number, requestId: number, functionName: string, functionParamsJson: string): void {
        sdk.symbols.deno_request(
            context,
            stringToPointer(functionName),
            stringToPointer(functionParamsJson),
            requestId,
        );
    },
    setResponseHandler(
        handler?: (
            requestId: number,
            paramsJson: string,
            responseType: number,
            finished: boolean,
        ) => void): void {
        let callback: Deno.UnsafeCallback | null = null;
        if (handler) {
            const newCallback = new Deno.UnsafeCallback(
                {
                    parameters: ["u32", "buffer", "u32", "bool"],
                    result: "void",
                } as const,
                (requestId: number, paramsJson: Deno.PointerValue, responseType: number, finished: boolean) => {
                    handler(requestId, stringFromPointer(paramsJson), responseType, finished);
                },
            );
            sdk.symbols.deno_set_response_callback(newCallback.pointer);
            callback = newCallback
        } else {
            sdk.symbols.deno_clear_response_callback();
        }
        if (currentCallback) {
            currentCallback.close();
        }
        currentCallback = callback;
    },
};

function stringToPointer(str: string) {
    return new TextEncoder().encode(str);
}

// Convert ArrayBuffer (pointer) back to a JavaScript string
function stringFromPointer(buf: Deno.PointerValue): string {
    if (!buf) {
        return "";
    }
    const dataView = new Deno.UnsafePointerView(buf);
    const result = dataView.getCString();
    sdk.symbols.deno_free_string(buf);
    return result;
}

export function libDeno() {
    return denoLib;
}
