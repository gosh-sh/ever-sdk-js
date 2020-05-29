/*
 * Copyright 2018-2020 TON DEV SOLUTIONS LTD.
 */
// @flow

import {Span, SpanContext} from 'opentracing';
import type {
    QAccount,
    QBlock,
    QMessage,
    QTransaction,
    TONContractABI,
    TONContractAccountWaitParams,
    TONContractConvertAddressParams,
    TONContractConvertAddressResult,
    TONContractCreateRunBodyParams,
    TONContractCreateRunBodyResult,
    TONContractCreateSignedDeployMessageParams,
    TONContractCreateSignedMessageParams,
    TONContractCreateSignedRunMessageParams,
    TONContractDecodeMessageBodyParams,
    TONContractDecodeMessageBodyResult,
    TONContractDecodeRunOutputParams,
    TONContractDeployMessage,
    TONContractDeployParams,
    TONContractDeployResult,
    TONContractCalcDeployFeeParams,
    TONContractBoc,
    TONContractGetBocHashResult,
    TONContractGetCodeFromImageParams,
    TONContractGetCodeFromImageResult,
    TONContractGetDeployDataParams,
    TONContractGetDeployDataResult,
    TONContractGetFunctionIdParams,
    TONContractGetFunctionIdResult,
    TONContractLoadParams,
    TONContractLoadResult,
    TONContractCalcRunFeeParams,
    TONContractTransactionFees,
    TONContractCalcFeeResult,
    TONContractCalcMsgProcessingFeesParams,
    TONContractMessage,
    TONContractRunLocalParams,
    TONContractRunMessage,
    TONContractRunParams,
    TONContractRunResult,
    TONContracts,
    TONContractUnsignedDeployMessage,
    TONContractUnsignedMessage,
    TONContractUnsignedRunMessage,
    TONContractRunGetParams,
    TONContractRunGetResult, TONContractPackage,
} from '../../types';
import {TONClientError} from '../TONClient';
import {TONModule} from '../TONModule';
import TONConfigModule from './TONConfigModule';
import TONQueriesModule from './TONQueriesModule';

export const TONAddressStringVariant = {
    AccountId: 'AccountId',
    Hex: 'Hex',
    Base64: 'Base64',
};

export const TONClientTransactionPhase = {
    storage: 'storage',
    computeSkipped: 'computeSkipped',
    computeVm: 'computeVm',
    action: 'action',
    unknown: 'unknown',
};

export const TONClientComputeSkippedStatus = {
    noState: 0,
    badState: 1,
    noGas: 2,
};

export const TONClientStorageStatus = {
    unchanged: 0,
    frozen: 1,
    deleted: 2,
};

export const QInMsgType = {
    external: 0,
    ihr: 1,
    immediately: 2,
    final: 3,
    transit: 4,
    discardedFinal: 5,
    discardedTransit: 6,
};

export const QOutMsgType = {
    external: 0,
    immediately: 1,
    outMsgNew: 2,
    transit: 3,
    dequeueImmediately: 4,
    dequeue: 5,
    transitRequired: 6,
    none: -1,
};

export const QMessageType = {
    internal: 0,
    extIn: 1,
    extOut: 2,
};

export const QMessageProcessingStatus = {
    unknown: 0,
    queued: 1,
    processing: 2,
    preliminary: 3,
    proposed: 4,
    finalized: 5,
    refused: 6,
    transiting: 7,
};

export const QBlockProcessingStatus = {
    unknown: 0,
    proposed: 1,
    finalized: 2,
    refused: 3,
};

export const QSplitType = {
    none: 0,
    split: 2,
    merge: 3,
};

export const QAccountType = {
    uninit: 0,
    active: 1,
    frozen: 2,
};

export const QTransactionType = {
    ordinary: 0,
    storage: 1,
    tick: 2,
    tock: 3,
    splitPrepare: 4,
    splitInstall: 5,
    mergePrepare: 6,
    mergeInstall: 7,
};

export const QTransactionProcessingStatus = {
    unknown: 0,
    preliminary: 1,
    proposed: 2,
    finalized: 3,
    refused: 4,
};

export const QAccountStatus = {
    uninit: 0,
    active: 1,
    frozen: 2,
    nonExist: 3,
};

export const QAccountStatusChange = {
    unchanged: 0,
    frozen: 1,
    deleted: 2,
};

export const QComputeType = {
    skipped: 0,
    vm: 1,
};

export const QSkipReason = {
    noState: 0,
    badState: 1,
    noGas: 2,
};

export const QBounceType = {
    negFunds: 0,
    noFunds: 1,
    ok: 2,
};

function removeTypeName(obj: any) {
    if (obj.__typename) {
        delete obj.__typename;
    }
    Object.values(obj)
        .forEach((value) => {
            if (!!value && typeof value === 'object') {
                removeTypeName(value);
            }
        });
}

export function removeProps(obj: {}, paths: string[]): {} {
    let result = obj;
    paths.forEach((path) => {
        const dotPos = path.indexOf('.');
        if (dotPos < 0) {
            if (path in result) {
                result = { ...result };
                delete result[path];
            }
        } else {
            const name = path.substr(0, dotPos);
            const child = result[name];
            if (child) {
                const reducedChild = removeProps(child, [path.substr(dotPos + 1)]);
                if (reducedChild !== child) {
                    result = {
                        ...result,
                        [name]: reducedChild,
                    };
                }
            }
        }
    });
    return result;
}

export default class TONContractsModule extends TONModule implements TONContracts {
    config: TONConfigModule;

    queries: TONQueriesModule;

    async setup(): Promise<*> {
        this.config = this.context.getModule(TONConfigModule);
        this.queries = this.context.getModule(TONQueriesModule);
    }

    async load(
        params: TONContractLoadParams,
        parentSpan?: (Span | SpanContext),
    ): Promise<TONContractLoadResult> {
        const accounts: QAccount[] = await this.queries.accounts.query({
            id: { eq: params.address },
        }, 'balance', undefined, undefined, undefined, parentSpan);
        if (accounts && accounts.length > 0) {
            return {
                id: params.address,
                balanceGrams: accounts[0].balance,
            };
        }
        return {
            id: null,
            balanceGrams: null,
        };
    }


    // Facade functions

    async deploy(
        params: TONContractDeployParams,
        parentSpan?: (Span | SpanContext),
    ): Promise<TONContractDeployResult> {
        return this.context.trace('contracts.deploy', async (span: Span) => {
            span.setTag('params', removeProps(params, ['keyPair.secret']));
            return this.internalDeployJs(params, span);
        }, parentSpan);
    }


    async run(
        params: TONContractRunParams,
        parentSpan?: (Span | SpanContext),
    ): Promise<TONContractRunResult> {
        return this.context.trace('contracts.run', async (span: Span) => {
            span.setTag('params', removeProps(params, ['keyPair.secret']));
            return this.internalRunJs(params, span);
        }, parentSpan);
    }

    async runLocal(
        params: TONContractRunLocalParams,
        parentSpan?: (Span | SpanContext),
    ): Promise<TONContractRunResult> {
        return this.context.trace('contracts.runLocal', async (span: Span) => {
            span.setTag('params', removeProps(params, ['keyPair.secret']));
            return this.internalRunLocalJs(params, span);
        }, parentSpan);
    }

    async runGet(
        params: TONContractRunGetParams,
    ): Promise<TONContractRunGetResult> {
        let coreParams: TONContractRunGetParams = params;
        if (!params.codeBase64 || !params.dataBase64) {
            if (!params.address) {
                throw TONClientError.addressRequiredForRunLocal();
            }
            const account: any = await this.getAccount(params.address, true);
            account.codeBase64 = account.code;
            account.dataBase64 = account.data;
            delete account.code;
            delete account.data;
            coreParams = {
                ...account,
                ...params,
            };
        }
        return this.requestCore('tvm.get', coreParams);
    }

    arrayFromCONS(cons: any[]): any[] {
        const result = [];
        let item = cons;
        while (item) {
            if (!item.length === 2) {
                throw TONClientError.invalidCons();
            }
            result.push(item[0]);
            item = item[1];
        }
        return result;
    }


    // Message creation

    async createDeployMessage(
        params: TONContractDeployParams,
        retryIndex?: number,
    ): Promise<TONContractDeployMessage> {
        this.config.log('createDeployMessage', params);
        const constructorHeader = this.makeExpireHeader(
            params.package.abi,
            params.constructorHeader,
            retryIndex,
        );
        const message: {
            address: string,
            messageId: string,
            messageBodyBase64: string,
        } = await this.requestCore('contracts.deploy.message', {
            abi: params.package.abi,
            constructorHeader,
            constructorParams: params.constructorParams,
            initParams: params.initParams,
            imageBase64: params.package.imageBase64,
            keyPair: params.keyPair,
            workchainId: params.workchainId,
        });
        return {
            message: {
                messageId: message.messageId,
                messageBodyBase64: message.messageBodyBase64,
                expire: constructorHeader?.expire,
            },
            address: message.address,
            creationTime: Date.now(),
        };
    }


    async createRunMessage(
        params: TONContractRunParams,
        retryIndex?: number,
    ): Promise<TONContractRunMessage> {
        this.config.log('createRunMessage', params);
        const header = this.makeExpireHeader(
            params.abi,
            params.header,
            retryIndex,
        );
        const message = await this.requestCore('contracts.run.message', {
            address: params.address,
            abi: params.abi,
            functionName: params.functionName,
            header,
            input: params.input,
            keyPair: params.keyPair,
        });
        message.expire = header?.expire;
        return {
            address: params.address,
            abi: params.abi,
            functionName: params.functionName,
            message,
            creationTime: Date.now(),
        };
    }

    async createUnsignedDeployMessage(
        params: TONContractDeployParams,
        retryIndex?: number,
    ): Promise<TONContractUnsignedDeployMessage> {
        const constructorHeader = this.makeExpireHeader(
            params.package.abi,
            params.constructorHeader,
            retryIndex,
        );
        const result: {
            encoded: TONContractUnsignedMessage,
            addressHex: string,
        } = await this.requestCore('contracts.deploy.encode_unsigned_message', {
            abi: params.package.abi,
            constructorHeader,
            constructorParams: params.constructorParams,
            initParams: params.initParams,
            imageBase64: params.package.imageBase64,
            publicKeyHex: params.keyPair.public,
            workchainId: params.workchainId,
        });
        return {
            address: result.addressHex,
            signParams: {
                ...result.encoded,
                abi: params.package.abi,
                expire: constructorHeader?.expire,
            },
        };
    }


    async createUnsignedRunMessage(
        params: TONContractRunParams,
        retryIndex?: number,
    ): Promise<TONContractUnsignedRunMessage> {
        const header = this.makeExpireHeader(
            params.abi,
            params.header,
            retryIndex,
        );
        const signParams = await this.requestCore('contracts.run.encode_unsigned_message', {
            address: params.address,
            abi: params.abi,
            functionName: params.functionName,
            header,
            input: params.input,
        });
        return {
            address: params.address,
            functionName: params.functionName,
            signParams: {
                ...signParams,
                abi: params.abi,
                expire: header?.expire,
            },
        };
    }


    async createSignedMessage(
        params: TONContractCreateSignedMessageParams,
    ): Promise<TONContractMessage> {
        return this.requestCore('contracts.encode_message_with_sign', params);
    }


    async createSignedDeployMessage(
        params: TONContractCreateSignedDeployMessageParams,
    ): Promise<TONContractDeployMessage> {
        const message = await this.createSignedMessage({
            abi: params.unsignedMessage.signParams.abi,
            unsignedBytesBase64: params.unsignedMessage.signParams.unsignedBytesBase64,
            signBytesBase64: params.signBytesBase64,
            publicKeyHex: params.publicKeyHex,
        });
        message.expire = params.unsignedMessage.signParams.expire;
        return {
            address: params.unsignedMessage.address,
            message,
            creationTime: Date.now(),
        };
    }


    async createSignedRunMessage(
        params: TONContractCreateSignedRunMessageParams,
    ): Promise<TONContractRunMessage> {
        const message = await this.createSignedMessage({
            abi: params.unsignedMessage.signParams.abi,
            unsignedBytesBase64: params.unsignedMessage.signParams.unsignedBytesBase64,
            signBytesBase64: params.signBytesBase64,
            publicKeyHex: params.publicKeyHex,
        });
        message.expire = params.unsignedMessage.signParams.expire;
        return {
            address: params.unsignedMessage.address,
            abi: params.unsignedMessage.signParams.abi,
            functionName: params.unsignedMessage.functionName,
            message,
            creationTime: Date.now(),
        };
    }

    async getCodeFromImage(
        params: TONContractGetCodeFromImageParams,
    ): Promise<TONContractGetCodeFromImageResult> {
        return this.requestCore('contracts.image.code', params);
    }

    async getDeployData(
        params: TONContractGetDeployDataParams,
    ): Promise<TONContractGetDeployDataResult> {
        return this.requestCore('contracts.deploy.data', params);
    }

    async createRunBody(
        params: TONContractCreateRunBodyParams,
    ): Promise<TONContractCreateRunBodyResult> {
        return this.requestCore('contracts.run.body', params);
    }

    async getFunctionId(
        params: TONContractGetFunctionIdParams,
    ): Promise<TONContractGetFunctionIdResult> {
        return this.requestCore('contracts.function.id', params);
    }

    async getBocHash(
        params: TONContractBoc,
    ): Promise<TONContractGetBocHashResult> {
        return this.requestCore('contracts.boc.hash', params);
    }

    async parseMessage(
        params: TONContractBoc,
    ): Promise<QMessage> {
        return this.requestCore('contracts.parse.message', params);
    }

    // Message parsing

    async decodeRunOutput(
        params: TONContractDecodeRunOutputParams,
    ): Promise<TONContractRunResult> {
        return this.requestCore('contracts.run.output', params);
    }


    async decodeInputMessageBody(
        params: TONContractDecodeMessageBodyParams,
    ): Promise<TONContractDecodeMessageBodyResult> {
        return this.requestCore('contracts.run.unknown.input', params);
    }


    async decodeOutputMessageBody(
        params: TONContractDecodeMessageBodyParams,
    ): Promise<TONContractDecodeMessageBodyResult> {
        return this.requestCore('contracts.run.unknown.output', params);
    }

    // Message processing

    async getMessageId(message: TONContractMessage): Promise<string> {
        return message.messageId || (await this.getBocHash({
            bocBase64: message.messageBodyBase64,
        })).hash;
    }

    async sendMessage(
        params: TONContractMessage,
        parentSpan?: (Span | SpanContext),
    ): Promise<string> {
        const expire = params.expire;
        if (expire && (Date.now() > expire * 1000)) {
            throw TONClientError.sendNodeRequestFailed('Message already expired');
        }
        const serverTimeDelta = Math.abs(await this.queries.serverTimeDelta(parentSpan));
        if (serverTimeDelta > this.config.outOfSyncThreshold()) {
            this.queries.dropServerTimeDelta();
            throw TONClientError.clockOutOfSync();
        }
        const id = await this.getMessageId(params);
        const idBase64 = Buffer.from(id, 'hex')
            .toString('base64');
        await this.queries.postRequests([
            {
                id: idBase64,
                body: params.messageBodyBase64,
            },
        ], parentSpan);
        this.config.log('sendMessage. Request posted');
        return id;
    }

    async processMessage(
        message: TONContractMessage,
        resultFields: string,
        parentSpan?: (Span | SpanContext),
        retryIndex?: number,
        address?: string,
        abi?: TONContractABI,
        functionName?: string,
        messageCreationTime?: number,
    ): Promise<QTransaction> {
        await this.sendMessage(message, parentSpan);
        return this.waitForTransaction(
            message,
            resultFields,
            parentSpan,
            retryIndex,
            address,
            messageCreationTime,
            abi,
            functionName,
        );
    }


    async waitForTransaction(
        message: TONContractMessage,
        resultFields: string,
        parentSpan?: (Span | SpanContext),
        retryIndex?: number,
        address?: string,
        messageCreationTime?: number,
        abi?: TONContractABI,
        functionName?: string,
    ): Promise<QTransaction> {
        const messageId = await this.getMessageId(message);
        const config = this.config;
        let processingTimeout = config.messageProcessingTimeout(retryIndex);
        const promises = [];
        const serverInfo = await this.queries.getServerInfo(parentSpan);
        const operationId = serverInfo.supportsOperationId
            ? this.queries.generateOperationId()
            : undefined;
        let transaction: ?QTransaction = null;
        try {
            const expire = message.expire;
            if (expire) {
                // calculate timeout according to `expire` value (in seconds)
                // add processing timeout as master block validation time
                processingTimeout = expire * 1000 - Date.now() + processingTimeout;

                const waitExpired = async () => {
                    // wait for block, produced after `expire` to guarantee that message is rejected
                    const block: QBlock = await this.queries.blocks.waitFor({
                        filter: {
                            master: { min_shard_gen_utime: { ge: expire } },
                        },
                        result: 'in_msg_descr { transaction_id }',
                        timeout: processingTimeout,
                        parentSpan,
                        operationId,
                    });

                    if (transaction) {
                        return;
                    }

                    const transaction_id = block.in_msg_descr
                        && block.in_msg_descr.find(msg => !!msg.transaction_id)?.transaction_id;

                    if (!transaction_id) {
                        throw TONClientError.internalError(
                            'Invalid block received: no transaction ID');
                    }

                    // check that transactions collection is updated
                    await this.queries.transactions.waitFor({
                        filter: {
                            id: { eq: transaction_id },
                        },
                        result: 'id',
                        timeout: processingTimeout,
                        parentSpan,
                        operationId,
                    });
                };

                promises.push(waitExpired());
            }

            // wait for message processing transaction
            promises.push(new Promise((resolve, reject) => {
                (async () => {
                    try {
                        transaction = await this.queries.transactions.waitFor({
                            filter: {
                                in_msg: { eq: messageId },
                                status: { eq: QTransactionProcessingStatus.finalized },
                            },
                            result: resultFields,
                            timeout: processingTimeout,
                            operationId,
                            parentSpan,
                        });
                        resolve();
                    } catch (error) {
                        reject(error);
                    }
                })();
            }));

            try {
                await Promise.race(promises);
            } finally {
                if (promises.length > 1 && operationId) {
                    await this.queries.finishOperations([operationId]);
                }
            }

            if (!transaction) {
                throw TONClientError.messageExpired();
            }
            const transactionNow = transaction.now || 0;
            this.config.log('processMessage. transaction received', {
                id: transaction.id,
                block_id: transaction.block_id,
                now: `${new Date(transactionNow * 1000).toISOString()} (${transactionNow})`,
            });
        } catch (error) {
            throw await this.resolveDetailedError(
                error,
                message.messageBodyBase64,
                messageCreationTime || Date.now(),
                address || '',
            );
        }
        removeTypeName(transaction);
        try {
            await this.requestCore('contracts.process.transaction', {
                transaction,
                abi: abi || null,
                functionName: functionName || null,
                address,
            });
        } catch (error) {
            if (error.code === TONClientError.code.ACCOUNT_CODE_MISSING) {
                const accounts = await this.queries.accounts.query({
                    filter: { id: { eq: address } },
                    result: 'acc_type',
                    timeout: 1000,
                });
                if (accounts.length === 0) {
                    throw TONClientError.accountMissing(address);
                }
            }
            throw error;
        }
        return transaction;
    }

    async resolveDetailedError(
        error: Error,
        messageBase64: string,
        time: number,
        address: string,
    ) {
        const accounts = await this.queries.accounts.query({
            filter: { id: { eq: address } },
            result: 'id acc_type balance balance_other { currency value } code data last_paid',
            timeout: 1000,
        });
        if (accounts.length === 0) {
            return TONClientError.accountMissing(address);
        }
        const account = accounts[0];
        removeTypeName(account);
        try {
            await this.requestCore('contracts.resolve.error', {
                address,
                account,
                messageBase64,
                time,
                mainError: error,
            });
        } catch (resolved) {
            return resolved;
        }
        return error;
    }

    async isDeployed(address: string, parentSpan?: (Span | SpanContext)): Promise<bool> {
        const account = await this.queries.accounts.query({
            filter: {
                id: { eq: address },
                acc_type: { eq: QAccountType.active },
            },
            result: 'id',
            parentSpan,
        });
        return account.length > 0;
    }

    async processDeployMessage(
        params: TONContractDeployMessage,
        parentSpan?: (Span | SpanContext),
        retryIndex?: number,
    ): Promise<TONContractDeployResult> {
        this.config.log('processDeployMessage', params);
        if (await this.isDeployed(params.address, parentSpan)) {
            return {
                address: params.address,
                alreadyDeployed: true,
            };
        }
        await this.sendMessage(params.message, parentSpan);
        return this.waitForDeployTransaction(
            params,
            parentSpan,
            retryIndex,
        );
    }

    async waitForDeployTransaction(
        deployMessage: TONContractDeployMessage,
        parentSpan?: (Span | SpanContext),
        retryIndex?: number,
    ): Promise<TONContractDeployResult> {
        const transaction = await this.waitForTransaction(
            deployMessage.message,
            transactionDetails,
            parentSpan,
            retryIndex,
            deployMessage.address,
            deployMessage.creationTime,
        );
        this.config.log('processDeployMessage. End');
        return {
            address: deployMessage.address,
            alreadyDeployed: false,
            transaction,
        };
    }


    async processRunMessage(
        runMessage: TONContractRunMessage,
        parentSpan?: (Span | SpanContext),
        retryIndex?: number,
    ): Promise<TONContractRunResult> {
        this.config.log('processRunMessage', runMessage);
        await this.sendMessage(runMessage.message, parentSpan);
        return this.waitForRunTransaction(runMessage, parentSpan, retryIndex);
    }

    async waitForRunTransaction(
        runMessage: TONContractRunMessage,
        parentSpan?: (Span | SpanContext),
        retryIndex?: number,
    ): Promise<TONContractRunResult> {
        const transaction = await this.waitForTransaction(
            runMessage.message,
            transactionDetails,
            parentSpan,
            retryIndex,
            runMessage.address,
            runMessage.creationTime,
            runMessage.abi,
            runMessage.functionName,
        );
        const outputMessages = transaction.out_messages;
        if (!outputMessages || outputMessages.length === 0) {
            return {
                output: null,
                transaction,
            };
        }
        const externalMessages: QMessage[] = outputMessages.filter((x: QMessage) => {
            return x.msg_type === QMessageType.extOut;
        });
        this.config.log('processRunMessage. Before messages parse');
        const outputs = await Promise.all(externalMessages.map((x: QMessage) => {
            return this.decodeOutputMessageBody({
                abi: runMessage.abi,
                bodyBase64: x.body || '',
            });
        }));
        const resultOutput = outputs.find((x: TONContractDecodeMessageBodyResult) => {
            return x.function.toLowerCase() === runMessage.functionName.toLowerCase();
        });
        this.config.log('processRunMessage. End');
        return {
            output: resultOutput ? resultOutput.output : null,
            transaction,
        };
    }

    async processRunMessageLocal(
        runMessage: TONContractRunMessage,
        waitParams?: TONContractAccountWaitParams,
        parentSpan?: (Span | SpanContext),
    ): Promise<TONContractRunResult> {
        this.config.log('processRunMessageLocal', runMessage);

        const account = await this.getAccount(runMessage.address, true, waitParams, parentSpan);

        return this.requestCore('contracts.run.local.msg', {
            address: runMessage.address,
            account,
            abi: runMessage.abi,
            functionName: runMessage.functionName,
            messageBase64: runMessage.message.messageBodyBase64,
        });
    }

    // Fee calculation

    bigBalance = '0x10000000000000';

    async calcRunFees(
        params: TONContractCalcRunFeeParams,
        parentSpan?: (Span | SpanContext),
    ): Promise<TONContractCalcFeeResult> {
        this.config.log('calcRunFees', params);

        const account = await this.getAccount(params.address, true, params.waitParams, parentSpan);

        if (params.emulateBalance) {
            account.balance = this.bigBalance;
        }

        return this.requestCore('contracts.run.fee', {
            address: params.address,
            account,
            abi: params.abi,
            functionName: params.functionName,
            input: params.input,
            keyPair: params.keyPair,
        });
    }

    async calcDeployFees(
        params: TONContractCalcDeployFeeParams,
        parentSpan?: (Span | SpanContext),
    ): Promise<TONContractCalcFeeResult> {
        this.config.log('calcDeployFees', params);

        const message = await this.createDeployMessage(params);

        return this.calcMsgProcessFees({
            address: message.address,
            message: message.message,
            emulateBalance: params.emulateBalance,
            newAccount: params.newAccount,
        }, parentSpan);
    }

    async calcMsgProcessFees(
        params: TONContractCalcMsgProcessingFeesParams,
        parentSpan?: (Span | SpanContext),
    ): Promise<TONContractCalcFeeResult> {
        this.config.log('calcMsgProcessFees', params);

        let account: QAccount = {
            balance: this.bigBalance,
            id: params.address,
            last_paid: Math.floor(Date.now() / 1000),
        };

        if (!params.newAccount) {
            account = await this.getAccount(params.address, false, params.waitParams, parentSpan);
        }

        if (params.emulateBalance) {
            account.balance = this.bigBalance;
        }

        return this.requestCore('contracts.run.fee.msg', {
            address: params.address,
            account,
            messageBase64: params.message.messageBodyBase64,
        });
    }

    // Address processing

    async convertAddress(
        params: TONContractConvertAddressParams,
    ): Promise<TONContractConvertAddressResult> {
        return this.requestCore('contracts.address.convert', params);
    }

    // Internals

    async internalDeployNative(params: TONContractDeployParams): Promise<TONContractDeployResult> {
        return this.requestCore('contracts.deploy', {
            abi: params.package.abi,
            constructorHeader: params.constructorHeader,
            constructorParams: params.constructorParams,
            initParams: params.initParams,
            imageBase64: params.package.imageBase64,
            keyPair: params.keyPair,
        });
    }


    async internalRunNative(params: TONContractRunParams): Promise<TONContractRunResult> {
        return this.requestCore('contracts.run', {
            address: params.address,
            abi: params.abi,
            functionName: params.functionName,
            header: params.header,
            input: params.input,
            keyPair: params.keyPair,
        });
    }

    makeExpireHeader(
        abi: TONContractABI,
        userHeader?: any,
        retryIndex?: number,
    ): any {
        const timeout = this.config.messageExpirationTimeout(retryIndex);
        if (abi.header && abi.header.includes('expire') && !userHeader?.expire) {
            return {
                ...userHeader,
                expire: Math.floor((Date.now() + timeout) / 1000) + 1,
            };
        }
        return userHeader;
    }

    async retryCall(call: (index: number) => Promise<any>): Promise<any> {
        const retriesCount = this.config.messageRetriesCount();
        for (let i = 0; i <= retriesCount; i += 1) {
            if (i > 0) {
                this.config.log(`Retry #${i}`);
            }
            try {
                return await call(i);
            } catch (error) {
                const code = error.code || 0;
                const exit_code = error.data && error.data.exit_code || 0;
                const useRetry = code === TONClientError.code.MESSAGE_EXPIRED
                    || (code === TONClientError.code.CONTRACT_EXECUTION_FAILED && exit_code === 52);
                if (!useRetry) {
                    throw error;
                }
            }
        }
        throw TONClientError.messageExpired();
    }

    async internalDeployJs(
        params: TONContractDeployParams,
        parentSpan?: (Span | SpanContext),
    ): Promise<TONContractDeployResult> {
        this.config.log('Deploy start');
        return this.retryCall(async (retryIndex) => {
            const deployMessage = await this.createDeployMessage(params, retryIndex);
            if (await this.isDeployed(deployMessage.address, parentSpan)) {
                return {
                    address: deployMessage.address,
                    alreadyDeployed: true,
                };
            }
            await this.sendMessage(deployMessage.message, parentSpan);
            return this.waitForDeployTransaction(deployMessage, parentSpan, retryIndex);
        });
    }


    async internalRunJs(
        params: TONContractRunParams,
        parentSpan?: (Span | SpanContext),
    ): Promise<TONContractRunResult> {
        this.config.log('Run start');
        return this.retryCall(async (retryIndex) => {
            const runMessage = await this.createRunMessage(params, retryIndex);
            await this.sendMessage(runMessage.message, parentSpan);
            return this.waitForRunTransaction(runMessage, parentSpan, retryIndex);
        });
    }

    async getAccount(
        address: string,
        active: boolean,
        waitParams?: TONContractAccountWaitParams,
        parentSpan?: (Span | SpanContext),
    ): Promise<QAccount> {
        const filter: { [string]: any } = {
            id: { eq: address },
        };
        if (waitParams && waitParams.transactionLt) {
            filter.last_trans_lt = { ge: waitParams.transactionLt };
        }
        if (active) {
            filter.acc_type = { eq: QAccountType.active };
        }

        this.config.log('getAccount. Filter', filter);
        const accounts = await this.queries.accounts.query({
            filter,
            result: 'id acc_type code data balance balance_other { currency value } last_paid',
            ...(waitParams && waitParams.timeout ? { timeout: waitParams.timeout } : {}),
            parentSpan,
        });
        if (accounts.length === 0) {
            throw TONClientError.accountMissing(address);
        }
        const account = accounts[0];
        removeTypeName(account);
        this.config.log('getAccount. Account received', account);
        return account;
    }

    async internalRunLocalJs(
        params: TONContractRunLocalParams,
        parentSpan?: (Span | SpanContext),
    ): Promise<TONContractRunResult> {
        const account = await this.getAccount(
            params.address,
            true,
            params.waitParams,
            parentSpan,
        );

        return this.requestCore('contracts.run.local', {
            address: params.address,
            account,
            abi: params.abi,
            functionName: params.functionName,
            input: params.input,
            keyPair: params.keyPair,
        });
    }
}

TONContractsModule.moduleName = 'TONContractsModule';

const transactionDetails = `
    id
    in_msg
    tr_type
    status
    in_msg
    out_msgs
    block_id
    now
    aborted
    lt
    storage {
        status_change
    }
    compute {
        compute_type
        skipped_reason
        success
        exit_code
        gas_fees
        gas_used
    }
    action {
        success
        valid
        result_code
        no_funds
    }
    out_messages {
        id
        msg_type
        body
        value
    }
   `;
