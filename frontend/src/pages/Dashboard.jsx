import React from "react";
import { useAccount, useReadContract } from "wagmi";
import { CONTRACTS } from "../config/contracts.js";

import IdentityJSON from "../abis/IdentityRegistry.json";
const IdentityABI = IdentityJSON.abi;

export default function Dashboard() {
  const { address, isConnected } = useAccount();

  const { data: isVerified } = useReadContract({
    address: CONTRACTS.identityRegistry,
    abi: IdentityABI,
    functionName: "isVerified",
    args: address ? [address] : undefined,
    query: {
      enabled: isConnected && !!address,
    },
  });

  if (!isConnected) {
    return <p>Connecte ton wallet pour accéder à ton espace investisseur.</p>;
  }

  return (
    <div style={{ maxWidth: 800 }}>
      <h1>Mon espace investisseur</h1>

      <p>
        <strong>Wallet connecté :</strong> {address}
      </p>

      <h2>Statut KYC</h2>
      {isVerified ? (
        <p>✅ Ton wallet est vérifié. Tu peux investir sur les biens disponibles.</p>
      ) : (
        <p>
          ⏳ Ton KYC n'est pas encore validé. Tu peux suivre son statut dans l’onglet
          KYC.
        </p>
      )}

      <h2>Mes investissements</h2>
      <p>
        La liste détaillée de tes tokens immobiliers pourra être affichée ici
        (à partir des contrats HouseSecurityToken / HouseEthSale).
      </p>
    </div>
  );
}
