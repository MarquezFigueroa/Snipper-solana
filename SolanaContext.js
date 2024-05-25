import React, { createContext, useContext, useState } from 'react';
import { Connection, Keypair } from '@solana/web3.js';

const SolanaContext = createContext(null);

export const useSolana = () => useContext(SolanaContext);

export const SolanaProvider = ({ children }) => {
    const [wallet, setWallet] = useState(null);
    const [connection, setConnection] = useState(new Connection('https://api.testnet.solana.com'));

    // Initialize wallet with a private key (safe handling of private keys is crucial and beyond this example)
    const initWallet = (privateKey) => {
        const keypair = Keypair.fromSecretKey(new Uint8Array(privateKey));
        setWallet(keypair);
    };

    return (
        <SolanaContext.Provider value={{ wallet, connection, initWallet }}>
            {children}
        </SolanaContext.Provider>
    );
};
