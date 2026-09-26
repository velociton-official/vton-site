# $VTON Jetton contract

$VTON should use a standard TON Jetton implementation (TEP-74) with metadata following TEP-64.

Do not hard-code a private key or fake contract address. Deploy an audited implementation on TON testnet first, set the Jetton Master address in VTON_JETTON_MASTER, mint test supply to a dedicated treasury wallet, and test claims before mainnet.

The backend sends Jetton transfers from the dedicated treasury wallet. The database mining balance is off-chain accounting until a claim transaction is successfully broadcast.
