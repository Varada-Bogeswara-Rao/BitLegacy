# Bitcoin Autonomous Will - Execution Instructions (Strict Scope)

## Objective
Build a hackathon-ready Bitcoin inheritance dApp on Midl with the highest demo value per hour.

Product pitch:
"Bitcoin Autonomous Will: split inheritance automatically and reveal a final message when claimed. No lawyers, just code."

## Strict Feature Decisions

### 1) Multi-Heir Percentage Splits
- Decision: ADD
- Priority: High
- Value: High
- Cost: ~8 hours (~1 day)
- Risk: Low-Medium

Why:
- Converts a toy flow into a real inheritance product.
- Strong visual/math moment in demo.
- Contract changes are manageable.

Implementation requirements:
- Replace single heir with list of heirs + percentages.
- Enforce total heir percentages == 100.
- On claim, distribute by percentage.
- Handle remainder consistently (round down; leave dust in contract).

Core Solidity shape:
```solidity
struct Heir {
    address wallet;
    uint256 percentage;
}

mapping(address => Heir[]) public heirs;
```

Acceptance criteria:
- Owner can add multiple heirs.
- Sum of percentages must equal exactly 100 before activation.
- Claim distributes funds according to percentages.
- Non-heirs cannot claim.

### 2) Proof-of-Life Challenge Variants
- Decision: SKIP
- Priority: Low
- Value: Medium at best
- Cost if implemented fully: +2 to 4 days
- Risk: High

Do not build:
- Random phrase challenge
- Social guardian confirmation
- Multi-sig guardian flows

Reason:
- Too much complexity for low judging impact.
- Worse UX than one-click check-in.
- Randomness + guardian orchestration is out of scope.

Optional compromise (only if extra time remains):
- Allow `checkIn(string optionalMessage)` and emit event.
- No cryptographic challenge logic.

### 3) Secret Message Reveal
- Decision: ADD
- Priority: High
- Value: Very High
- Cost: ~4-6 hours
- Risk: Low

Why:
- Emotional and memorable demo moment.
- Simple implementation with high narrative impact.

Implementation requirements:
- Add message field to vault.
- Capture message at vault creation.
- Reveal message when inheritance is claimed.

Notes:
- Hackathon mode: store plaintext.
- Do not implement full encryption/key management now.
- Add TODO for production encryption.

### 4) Rename Positioning to "Bitcoin Autonomous Will"
- Decision: ADD
- Priority: Medium
- Value: Medium-High
- Cost: ~15 minutes
- Risk: None

Required renames:
- Landing page title/copy
- README title/copy
- Contract naming where practical
- Demo/Twitter phrasing

## Final Scope Summary
Build these:
1. Multi-heir percentage splits
2. Secret message reveal
3. Rename product to Bitcoin Autonomous Will

Skip this:
1. Proof-of-life challenge systems

## Revised Timeline
- Original estimate: 11 days
- Added scope: +1.5 days
- New total: 12.5 days
- Buffer remaining in 14-day window: ~1.5 days

## Daily Plan
- Day 1-2: Core contract baseline
- Day 3: Multi-heir + percentage validation
- Day 4: Wallet integration
- Day 5: CreateVault form (heirs + message)
- Day 6: Dashboard + check-in
- Day 7: Claim interface + message reveal
- Day 8-9: Testing + polish
- Day 10: Demo prep
- Day 11-14: Buffer

## Engineering Requirements

### Contract
- Solidity ^0.8.20
- Reentrancy protections on fund-moving functions
- Explicit input validation
- Prevent double-claim
- Event emissions for key actions

Core capabilities:
- `createVault(...)`
- `checkIn(...)`
- `claimInheritance(...)`
- `cancelVault()`
- `getVaultStatus(...)`

Additional rules for this scope:
- Heir percentages must total exactly 100.
- Claim path should emit message reveal event.

### Frontend
- React + TypeScript + Tailwind
- CreateVault:
  - Dynamic heir rows (address + %)
  - Validation for percentages and addresses
  - Optional personal message textarea
- Dashboard:
  - Display all heirs and percentages
  - Show status/countdown/check-in
- Claim interface:
  - Show claim eligibility
  - Trigger claim
  - Display revealed message after success

### Testing
Minimum tests:
- Percent total validation (not 100 -> reject)
- Valid distribution across multiple heirs
- Early claim rejection
- Correct post-expiry claim behavior
- Cancel flow behavior
- Message stored and revealed on claim

## Edge Cases to Handle

### Contract Level
1. Percentage validation only at vault creation, not per-heir addition.
2. Max 10 heirs (gas limit protection).
3. Message max 500 chars (storage cost protection).
4. Cancellation only allowed before expiry.
5. Single claim distributes to all heirs (no multi-claim).
6. Handle division remainder (dust stays in contract).

### Frontend Level
1. Validate Bitcoin address format before submission.
2. Show running total of percentages as heirs are added.
3. Disable `Create Vault` if percentages are not equal to 100.
4. Show gas estimation before transaction.
5. Handle Xverse rejection gracefully.
6. Poll for transaction confirmation (do not assume instant finality).

### Testing Level
1. Test with 1 heir (100%).
2. Test with 10 heirs (10% each).
3. Test with 3 heirs (33%, 33%, 34%) and verify remainder handling.
4. Test cancellation at T-1 day before expiry.
5. Test claim attempt at T-1 second before expiry (should fail).

## Deployment Checklist

## Pre-Demo Deployment Verification

### Day 8 (Early Testing)
- [ ] Deploy to Regtest with test wallets
- [ ] Create vault with 2 heirs + message
- [ ] Verify percentage distribution math on-chain
- [ ] Set check-in interval to 1 minute (for fast testing)
- [ ] Trigger expiry and claim
- [ ] Verify message reveals correctly
- [ ] Test cancellation before expiry

### Day 9 (Stress Testing)
- [ ] Test with 10 heirs (max limit)
- [ ] Test with long message (500 chars)
- [ ] Test with dust amounts (0.0001 BTC)
- [ ] Test on mobile browser (responsive check)
- [ ] Have friend test with fresh wallet

### Day 10 (Demo Prep)
- [ ] Fresh contract deployment (clean state)
- [ ] Pre-fund test wallets with BTC
- [ ] Rehearse demo 3x start-to-finish
- [ ] Record backup video (in case live demo breaks)
- [ ] Screenshot all transaction hashes

## Demo Script (Updated, 90s)
- 00:00: "Meet Alice. She wants to secure her Bitcoin legacy."
- 00:10: Alice creates vault with 0.1 BTC.
- 00:15: Adds heirs:
  - Son 50%
  - Daughter 30%
  - Charity 20%
- 00:25: Adds final message.
- 00:30: Demonstrates periodic check-in.
- 00:40: Fast-forward to missed check-in.
- 00:50: Heir wallet connects.
- 00:55: Clicks claim.
- 01:00: Receives proportional amount.
- 01:05: Message is revealed.
- 01:15: Close with: "Bitcoin inheritance. No lawyers. Just code."

## Explicit "Do Not Add" List
- NFT check-in badges
- Social recovery guardians
- Randomized proof-of-life challenges
- Time-delay escape hatches
- Yield/staking mechanics
- Multi-language localization
- Mobile app scope expansion

## Execution Order (Non-Negotiable)
1. Ship core contract and basic flow.
2. Add multi-heir math + validations.
3. Add message capture/reveal.
4. Polish UI and narrative copy rename.
5. Record demo early.

## Success Criteria
- Working end-to-end inheritance flow with Xverse signing.
- Multi-heir split works visibly and correctly.
- Message reveal works in claim flow.
- Positioning consistently uses "Bitcoin Autonomous Will".
- Demo is clear, emotional, and technically credible.
