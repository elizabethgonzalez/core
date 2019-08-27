import { app, Contracts } from "@arkecosystem/core-kernel";
import { Enums } from "@arkecosystem/crypto";
import Boom from "@hapi/boom";
import { ServerCache } from "../../services";
import { paginate, respondWithResource, toPagination } from "../utils";

const { TransactionType } = Enums;

const databaseService = app.get<Contracts.Database.DatabaseService>("database");
const transactionsRepository = databaseService.transactionsBusinessRepository;

const index = async request => {
    const transactions = await transactionsRepository.findAllByType(TransactionType.Vote, {
        ...request.query,
        ...paginate(request),
    });

    return toPagination(transactions, "transaction", (request.query.transform as unknown) as boolean);
};

const show = async request => {
    const transaction = await transactionsRepository.findByTypeAndId(TransactionType.Vote, request.params.id);

    if (!transaction) {
        return Boom.notFound("Vote not found");
    }

    return respondWithResource(transaction, "transaction", (request.query.transform as unknown) as boolean);
};

export const registerMethods = server => {
    ServerCache.make(server)
        .method("v2.votes.index", index, 8, request => ({
            ...request.query,
            ...paginate(request),
        }))
        .method("v2.votes.show", show, 8, request => ({ ...{ id: request.params.id }, ...request.query }));
};
