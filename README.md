# 🏠 House of Tokens – Web3 Real Estate App

Application Web3 de **tokenisation immobilière** permettant à des investisseurs KYC-validés d’acheter des parts d’un bien immobilier sous forme de **security tokens ERC20**, en payant en **ETH**.

Le projet combine **smart contracts Ethereum** et **application web React** pour offrir une expérience utilisateur complète, sécurisée et conforme.

---

## 📐 Architecture globale

┌────────────┐
│ Frontend │ React / Vite / wagmi
└─────┬──────┘
│
▼
┌────────────┐
│ Blockchain │ Ethereum (Sepolia)
└─────┬──────┘
│
┌─────▼──────────────────────────────────────────┐
│ Smart Contracts │
│ │
│ IdentityRegistry → whitelist KYC │
│ KYCRequestRegistry → preuve de soumission KYC │
│ TokenFactory → création des biens │
│ HouseSecurityToken → ERC20 (parts du bien) │
│ HouseEthSale → vente contre ETH │
└────────────────────────────────────────────────┘



---

## 🧱 Smart Contracts

### IdentityRegistry
Gère la **whitelist des investisseurs**.

- Validation / révocation KYC
- Utilisé par les contrats de vente

### KYCRequestRegistry
Preuve on-chain de soumission KYC.

- Stocke uniquement un **hash**
- Aucune donnée personnelle stockée

### TokenFactory
Usine de création des biens.

- Déploie les tokens ERC20
- Maintient un registre global
- Soft-delete on-chain

### HouseSecurityToken (ERC20)
Représente un bien immobilier fractionné.

- Supply maximale fixe
- Mint contrôlé par le contrat de vente
- Intégration KYC

### HouseEthSale
Contrat de vente des tokens.

- Achat en ETH
- Investissement minimum
- Vérification KYC
- Mint automatique des tokens

---

## 🌐 Frontend (Application Web)

### Stack technique
- **React 19**
- **Vite**
- **wagmi v3**
- **viem**
- **ethers v6**
- **React Router**
- **TanStack Query**

### Rôle des librairies Web3
- **wagmi** : hooks React pour wallet, read/write contract
- **viem** : encodage ABI, hashing (keccak256), BigInt
- **ethers** : compatibilité tooling Hardhat / écosystème Web3

---

## 📄 Pages de l’application

| Page | Description |
|----|-----------|
| `/` | Page d’accueil |
| `/market` | Liste des biens publiés |
| `/house/:address` | Détail d’un bien + investissement |
| `/kyc` | Soumission du KYC |
| `/dashboard` | Vue investisseur |
| `/admin` | Back-office administrateur |

---

## ⚙️ Installation

### Prérequis
- Node.js ≥ 18
- npm ou yarn
- Wallet Ethereum (MetaMask)
- Réseau **Sepolia**

---

## 📦 Installation du projet

### 1️⃣ Cloner le dépôt
```bash
git clone https://github.com/CalineB/Caline-BRUNO.git
cd blockchain/

npm install

Compilation
npx hardhat compile

Tests
npx hardhat test

Couverture
npx hardhat coverage

Déploiement (Sepolia)
npx hardhat run scripts/deploy.ts --network sepolia

🧪 Tests & sécurité
Tests réalisés

Déploiement des contrats

Soumission et validation KYC

Achat de tokens

Vérification whitelist

Limites de supply

Rôles administrateurs

Auto-audit

Protection ReentrancyGuard

onlyOwner et rôles contrôlés

Aucun document stocké on-chain

Soft-delete au lieu de suppression

🖥️ Frontend
Installation
cd frontend
npm install

Lancer en développement
npm run dev

Build production
npm run build

🚀 Pourquoi la blockchain ?

Transparence des investissements

Traçabilité des parts

Paiement trustless

Tokenisation programmable

Sécurité et auditabilité