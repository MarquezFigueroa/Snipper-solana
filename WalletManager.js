import React, { useState } from 'react';
import { useSolana } from './SolanaContext';

export const WalletManager = () => {
    const { wallet, connection, initWallet } = useSolana();
    const [privateKey, setPrivateKey] = useState('');

    const handlePrivateKeyChange = (event) => {
        setPrivateKey(event.target.value);
    };

    const handleInitWallet = () => {
        initWallet(privateKey);
    };

    return (
        <div>
            <input type="text" value={privateKey} onChange={handlePrivateKeyChange} placeholder="Enter your private key" />
            <button onClick={handleInitWallet}>Initialize Wallet</button>
            {wallet && <p>Wallet initialized: {wallet.publicKey.toString()}</p>}
        </div>
    );
};
