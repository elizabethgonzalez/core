import { Blocks, CryptoSuite, Interfaces } from "@arkecosystem/core-crypto";
import { Utils as AppUtils } from "@arkecosystem/core-kernel";
import { Interfaces as TransactionInterfaces } from "@arkecosystem/crypto";
import forge from "node-forge";
import wif from "wif";

import { Delegate } from "../interfaces";
import { Method } from "./method";

export class BIP38 extends Method implements Delegate {
    /**
     * @type {Interfaces.IKeyPair}
     * @memberof BIP38
     */
    public keys: TransactionInterfaces.IKeyPair | undefined;

    /**
     * @type {string}
     * @memberof BIP38
     */
    public publicKey: string;

    /**
     * @type {string}
     * @memberof BIP38
     */
    public address: string;

    /**
     * @type {string}
     * @memberof BIP38
     */
    public otpSecret: string;

    /**
     * @type {(string | undefined)}
     * @memberof BIP38
     */
    public otp: string | undefined;

    /**
     * @type {(string | undefined)}
     * @memberof BIP38
     */
    public encryptedKeys: string | undefined;

    /**
     * @type {number}
     * @memberof BIP38
     */
    private readonly keySize: number = 32;

    /**
     * @type {number}
     * @memberof BIP38
     */
    private readonly iterations: number = 5000;

    /**
     * @param {string} bip38
     * @param {string} password
     * @memberof BIP38
     */
    public constructor(
        cryptoManager: CryptoSuite.CryptoManager,
        blockFactory: Blocks.BlockFactory,
        bip38: string,
        password: string,
    ) {
        super(cryptoManager, blockFactory);

        this.keys = this.decryptPassphrase(bip38, password);
        this.publicKey = this.keys.publicKey;
        this.address = this.cryptoManager.Identities.Address.fromPublicKey(this.keys.publicKey);
        this.otpSecret = forge.random.getBytesSync(128);

        this.encryptKeysWithOtp();
    }

    /**
     * @param {Interfaces.ITransactionData[]} transactions
     * @param {Record<string, any>} options
     * @returns {Interfaces.IBlock}
     * @memberof BIP38
     */
    public forge(
        transactions: TransactionInterfaces.ITransactionData[],
        options: Record<string, any>,
    ): Interfaces.IBlock {
        this.decryptKeysWithOtp();

        AppUtils.assert.defined<TransactionInterfaces.IKeyPair>(this.keys);

        const block: Interfaces.IBlock = this.createBlock(this.keys, transactions, options);

        this.encryptKeysWithOtp();

        return block;
    }

    /**
     * @private
     * @memberof BIP38
     */
    private encryptKeysWithOtp(): void {
        AppUtils.assert.defined<TransactionInterfaces.IKeyPair>(this.keys);

        const wifKey: string = this.cryptoManager.Identities.Wif.fromKeys(this.keys);

        this.keys = undefined;
        this.otp = forge.random.getBytesSync(16);
        this.encryptedKeys = this.encryptDataWithOtp(wifKey, this.otp);
    }

    /**
     * @private
     * @memberof BIP38
     */
    private decryptKeysWithOtp(): void {
        AppUtils.assert.defined<string>(this.encryptedKeys);
        AppUtils.assert.defined<string>(this.otp);

        const wifKey: string = this.decryptDataWithOtp(this.encryptedKeys, this.otp);

        this.keys = this.cryptoManager.Identities.Keys.fromWIF(wifKey);
        this.otp = undefined;
        this.encryptedKeys = undefined;
    }

    /**
     * @private
     * @param {string} passphrase
     * @param {string} password
     * @returns {Interfaces.IKeyPair}
     * @memberof BIP38
     */
    private decryptPassphrase(passphrase: string, password: string): TransactionInterfaces.IKeyPair {
        const decryptedWif: TransactionInterfaces.IDecryptResult = this.cryptoManager.LibraryManager.Crypto.Bip38.decrypt(
            passphrase,
            password,
        );
        const wifKey: string = wif.encode(
            this.cryptoManager.NetworkConfigManager.get("network.wif"),
            decryptedWif.privateKey,
            decryptedWif.compressed,
        );

        return this.cryptoManager.Identities.Keys.fromWIF(wifKey);
    }

    /**
     * @private
     * @param {string} content
     * @param {string} password
     * @returns {string}
     * @memberof BIP38
     */
    private encryptDataWithOtp(content: string, password: string): string {
        AppUtils.assert.defined<string>(this.otpSecret);

        const cipher: forge.cipher.BlockCipher = forge.cipher.createCipher(
            "AES-CBC",
            forge.pkcs5.pbkdf2(password, this.otpSecret, this.iterations, this.keySize),
        );
        cipher.start({ iv: this.otp });
        cipher.update(forge.util.createBuffer(content));
        cipher.finish();

        return forge.util.encode64(cipher.output.getBytes());
    }

    /**
     * @private
     * @param {string} cipherText
     * @param {string} password
     * @returns {string}
     * @memberof BIP38
     */
    private decryptDataWithOtp(cipherText: string, password: string): string {
        AppUtils.assert.defined<string>(this.otpSecret);

        const decipher: forge.cipher.BlockCipher = forge.cipher.createDecipher(
            "AES-CBC",
            forge.pkcs5.pbkdf2(password, this.otpSecret, this.iterations, this.keySize),
        );
        decipher.start({ iv: this.otp });
        decipher.update(forge.util.createBuffer(forge.util.decode64(cipherText)));
        decipher.finish();

        return decipher.output.toString();
    }
}
