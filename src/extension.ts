import * as vscode from 'vscode';
import axios from 'axios';

/**
 * This function is called when the extension is activated.
 * It registers the 'code-bot.reviseCode' command.
 * @param context - The context in which the extension is run, provided by VSCode.
 */
export function activate(context: vscode.ExtensionContext): void {
    // Command for default prompt
    const reviseCodeDisposable = vscode.commands.registerCommand('code-bot.reviseCode', async () => {
        const defaultPrompt = vscode.workspace.getConfiguration('code-bot').get<string>('prompt');
        const commandPrompt = await vscode.window.showInputBox({
            prompt: "Enter the prompt for code revision",
            value: defaultPrompt
        });
        if (commandPrompt) {
            await handleCommand(commandPrompt);
        } else {
            vscode.window.showErrorMessage("No prompt provided.");
        }
    });

    context.subscriptions.push(reviseCodeDisposable);
}

/**
 * Handles the execution of a code revision command by fetching the active editor's content,
 * processing the code via the OpenAi API, and then updating the current editor with the revised code.
 * @param prompt - The user-defined or default prompt used for code revision.
 */
async function handleCommand(prompt: string): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showErrorMessage("No active editor found");
        return;
    }

    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: "Revising code",
        cancellable: true
    }, async (progress, token) => {
        progress.report({ message: "Sending code to OpenAi..." });

        const document = editor.document;
        const code = document.getText();
        const diagnostics = vscode.languages.getDiagnostics(document.uri);
        if (token.isCancellationRequested) {
            return;
        }

        const reviewedCode = await processCode(prompt, code, diagnostics, token);
        if (token.isCancellationRequested) {
            return;
        }

        if (reviewedCode) {
            const fullRange = new vscode.Range(
                document.positionAt(0),
                document.positionAt(document.getText().length)
            );

            await editor.edit(editBuilder => {
                editBuilder.replace(fullRange, reviewedCode);
            });

            await document.save();
        } else {
            vscode.window.showErrorMessage("Failed to revise code.");
        }
    });
}


/**
 * Processes the code for revision by sending it to the OpenAi API along with the prompt and any diagnostics.
 * @param prompt - The revision prompt.
 * @param code - The source code to be revised.
 * @param diagnostics - Diagnostic data related to the code.
 * @param token - Cancellation token to support cancellation.
 * @returns The revised code as a string, or null if the revision fails.
 */
async function processCode(prompt: string, code: string, diagnostics: vscode.Diagnostic[], token: vscode.CancellationToken): Promise<string | null> {
    return await getChatGPTResponse(prompt, code, diagnostics, token);
}

/**
 * Sends a request to OpenAi's API to get a code revision based on the provided prompt, code, and diagnostics.
 * @param prompt - The prompt for the code revision.
 * @param code - The code to be revised.
 * @param diagnostics - Diagnostic information about the code.
 * @param token - Cancellation token to support cancellation.
 * @returns A string containing the revised code or null if the API call fails.
 */
async function getChatGPTResponse(prompt: string, code: string, diagnostics: vscode.Diagnostic[], token: vscode.CancellationToken): Promise<string | null> {
    const OpenAiApiKey = vscode.workspace.getConfiguration('code-bot').get<string>('apiKey');
    const OpenAiModel = vscode.workspace.getConfiguration('code-bot').get<string>('model');
    try {
        const response = await axios.post('https://api.OpenAi.com/v1/chat/completions', {
            model: OpenAiModel,
            messages: [
                {
                    role: 'system',
                    content: `
                    You are an AI assistant that reviews and improves code. 
                    Compiler Output:
                    > ${JSON.stringify(diagnostics ?? {})}
                     
                    Your task is
                    > ${prompt} 
                    
                    Please update the following code according to these instructions. Only provide the updated code in your response.
                    `
                },
                {
                    role: 'user',
                    content: `${code}`
                },
            ],
            max_tokens: 1500,
            temperature: 0.5
        }, {
            headers: {
                'Authorization': `Bearer ${OpenAiApiKey}`,
                'Content-Type': 'application/json'
            },
            cancelToken: new axios.CancelToken(c => {
                token.onCancellationRequested(() => {
                    c();
                });
            })
        });

        if (response.data && response.data.choices && response.data.choices.length > 0) {
            return response.data.choices[0].message.content.trim();
        }
        return null;
    } catch (error: any) {
        if (axios.isCancel(error)) {
            console.log('Request canceled', error.message);
        } else {
            console.error(error);
            vscode.window.showErrorMessage("Failed to get response from OpenAi: " + (error.response?.data?.error?.message || error.message));
        }
        return null;
    }
}


/**
 * Deactivates the extension. This function is called when the extension is deactivated.
 */
export function deactivate() {}