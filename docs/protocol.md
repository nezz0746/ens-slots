# The protocol, as deployed

What exists, how a namespace is opened, how a name resolves, where the money
goes, and how terms change. Current as of factory v2 / namespace v4 on Sepolia.

---

## What exists

Only the first group is ours. ENSv2 owns the names, 0xSlots owns the markets,
and this sits between them holding neither.

```mermaid
graph LR
    subgraph OURS["Nameslots"]
        F["SlotNamespaceFactory<br/><i>the index</i>"]
        NS["SlotNamespace<br/><i>one per parent name</i>"]
        RES["SlotNamespaceResolver<br/><i>one for all of them</i>"]
    end

    subgraph ENS["ENSv2 — the names"]
        ETH["PermissionedRegistry<br/><i>.eth</i>"]
        VF["VerifiableFactory"]
        USER["UserRegistry<br/><i>one per parent name</i>"]
    end

    subgraph SLOTS["0xSlots — the markets"]
        SF["SlotFactory"]
        SLOT["Slot<br/><i>one per slotted label</i>"]
        HOOK["MinimumTenureHook"]
    end

    F -->|"opens, and indexes by parent node"| NS
    F -->|deploys through| VF
    VF -->|creates| USER
    RES -->|asks| F

    NS -->|registers labels into| USER
    USER -->|"resolver ="| RES
    NS -->|"owner() = ownerOf(parent)"| ETH

    NS -->|"createSlot()"| SF
    SF -->|creates| SLOT
    NS -->|"manager &amp; recipient of"| SLOT
    SLOT -.->|consults| HOOK

    classDef ours fill:#0080bc,stroke:#011a25,color:#fff
    classDef ens fill:#cee1e8,stroke:#011a25,color:#011a25
    classDef slot fill:#f2c4da,stroke:#011a25,color:#011a25
    class F,NS,RES ours
    class ETH,VF,USER ens
    class SF,SLOT,HOOK slot
```

The factory is the index because nothing else can be: an ENSv2 registry does not
know its own name, and resolution only ever walks *down* from the root. So the
resolver cannot ask a name which namespace it belongs to — it asks the factory.

---

## Opening a namespace

One transaction for everything the factory can do. The second is `setSubregistry`,
which belongs to the name's owner and to nobody else — the app sends it, but the
factory could never send it on anyone's behalf.

```mermaid
sequenceDiagram
    actor Owner as Owner of france.eth
    participant F as SlotNamespaceFactory
    participant ETH as .eth registry
    participant VF as VerifiableFactory
    participant NS as SlotNamespace
    participant SF as SlotFactory

    Owner->>F: open({registry: 0, "france.eth", currency, labels})
    F->>F: labelhash + node, derived from the string
    F->>F: revert if already opened
    F->>ETH: ownerOf(getTokenId(labelhash))
    ETH-->>F: 0x26bB… — nobody chooses this
    F->>NS: deploy the namespace
    F->>VF: deployProxy(UserRegistry)
    Note over VF: namespace → REGISTRAR + UNREGISTER<br/>owner → ALL_ROLES
    F->>NS: initialize(registry, terms, labels, …)

    loop each label
        NS->>SF: createSlot(manager = recipient = namespace)
        NS->>NS: register the label, set its resolver
    end

    F-->>Owner: namespace, registry

    Owner->>ETH: setSubregistry(tokenId, registry)
    Note right of Owner: a second transaction —<br/>only the name's owner can
```

Terms are per label. There is no namespace default to inherit: every label states
its own tax rate and its own guaranteed run, or it is not opened.

---

## How a name resolves

Ordinary ENS. No SDK, no API key, no contract address — and a turnover writes
nothing, so nothing about it can fail.

```mermaid
sequenceDiagram
    actor C as Any ENS client
    participant UR as UniversalResolver
    participant USER as UserRegistry (france.eth)
    participant RES as SlotNamespaceResolver
    participant F as SlotNamespaceFactory
    participant NS as SlotNamespace
    participant S as Slot (paris)

    C->>UR: addr("paris.france.eth")
    UR->>USER: walk down from the root
    USER-->>UR: resolver = SlotNamespaceResolver
    UR->>RES: resolve(dnsName, addr(node))
    RES->>RES: find() — strip a label, try the parent
    RES->>F: namespaceOf(parentNode)
    F-->>RES: the namespace
    RES->>NS: addrOf(node)
    NS->>S: occupant()
    S-->>NS: 0xAlice
    NS-->>RES: 0xAlice
    RES-->>C: 0xAlice
```

The subname stays registered to the namespace contract permanently. What follows
the holder is *resolution*, read at the moment you ask. Text records are keyed by
the slot's `tenureId`, so they clear on turnover and do not come back if the same
person retakes the name.

---

## Where the value goes

Authority and income are both derived from the ENS name, not stored. Sell
`france.eth` and both move to the buyer in the same block, with no transaction.

```mermaid
graph LR
    OCC["Occupant"] -->|"buy() — price + tax deposit"| SLOT["Slot"]
    SLOT -->|"collect() — tax accrued"| NS["SlotNamespace<br/><i>recipient &amp; manager</i>"]
    SLOT -.->|"push failed → credited"| SLOT
    NS -->|"sweep(label) → claim()"| SLOT
    NS -->|"withdraw() — anyone may call"| OWN["owner()"]
    OWN -.->|"= ethRegistry.ownerOf(parent)"| ETH[".eth registry"]
    BUYER["Anyone"] -->|"buy() at the stated price"| SLOT
    SLOT -->|"the price"| OCC

    classDef ours fill:#0080bc,stroke:#011a25,color:#fff
    classDef other fill:#cee1e8,stroke:#011a25,color:#011a25
    class NS ours
    class SLOT,ETH,OCC,BUYER,OWN other
```

`withdraw()` is ungated on purpose: it pays `owner()` whoever calls it, so someone
else triggering a payment *to* the owner is a favour, not an attack. `sweep()`
exists because the slot pushes payouts with only `PAYOUT_GAS` of head-room and
credits them when that fails.

---

## Changing the terms

The owner can re-price the market they run, but never *now*.

```mermaid
stateDiagram-v2
    direction LR
    [*] --> Live: label slotted with its own terms
    Live --> Queued: owner calls proposeLabelTerms
    Queued --> Queued: proposing again replaces it
    Queued --> Live: cancelLabelTerms
    Queued --> Ripe: TERMS_DELAY (1 day) passes
    Ripe --> Live: applied at the next occupancy transition
    note right of Ripe
        Whoever is holding the name keeps
        the terms they agreed to until they leave.
    end note
```

Which is why the app's button says "Queue it", never "Set", and the panel everyone
can see says what is queued. A change nobody could see coming would be the trap.

---

## Authority, in one list

| Who | What they can do | Where it comes from |
|---|---|---|
| Holder of the parent `.eth` name | Slot and unslot labels, propose terms, edit the parent profile, receive all tax | `ethRegistry.ownerOf` — derived, never stored, non-transferable on its own |
| Occupant of a label | Set that name's price, write its records, be bought out | `slot.occupant()`, records scoped to `tenureId` |
| Anyone | Buy any occupied label at its stated price, `collect()`, `sweep()`, `withdraw()` to the owner | ungated by design |
| `admin` | Replace the code behind every namespace at once | one key today; `transferAdmin` moves it to a multisig |
