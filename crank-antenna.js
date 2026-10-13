#!/usr/bin/env node
// A JavaScript port of the "crank the landing radar antenna" check from
// Luminary099/THE_LUNAR_LANDING.agc (P63SPOT3 / P63SPOT4, page 789).
//
// Original AGC code:
//
//   P63SPOT3  CA    BIT6        # IS THE LR ANTENNA IN POSITION 1 YET
//             EXTEND
//             RAND  CHAN33
//             EXTEND
//             BZF   P63SPOT4    # BRANCH IF ANTENNA ALREADY IN POSITION 1
//
//             CAF   CODE500     # ASTRONAUT:  PLEASE CRANK THE
//             TC    BANKCALL    #             SILLY THING AROUND
//             CADR  GOPERF1
//             TCF   GOTOPOOH    # TERMINATE
//             TCF   P63SPOT3    # PROCEED     SEE IF HE'S LYING
//
//   P63SPOT4  TC    BANKCALL    # ENTER       INITIALIZE LANDING RADAR
//             CADR  SETPOS1
//
//             TC    POSTJUMP    # OFF TO SEE THE WIZARD...
//             CADR  BURNBABY
//
// Run it:  node crank-antenna.js

const readline = require("node:readline");

// ---------------------------------------------------------------------------
// Simulated hardware
// ---------------------------------------------------------------------------

const BIT6 = 0b100000; // octal 40
const CODE500 = 0o500;

// Input channel 33. AGC discrete inputs are mostly "active low": a bit reads
// 0 when the condition is TRUE. So BIT6 = 0 means "LR antenna is in
// position 1". We start with the antenna in position 2 (bit set).
let CHAN33 = BIT6;

const antennaInPosition1 = () => (CHAN33 & BIT6) === 0;

// ---------------------------------------------------------------------------
// DSKY / crew interface
// ---------------------------------------------------------------------------

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const lines = rl[Symbol.asyncIterator]();
async function ask(prompt) {
  process.stdout.write(prompt);
  const { value, done } = await lines.next();
  if (done) {
    console.log("\n  (no more input)");
    process.exit(0);
  }
  return value;
}

function showDsky(verb, noun, r1) {
  const oct = (n) => n.toString(8).padStart(5, "0");
  console.log(`
  +-----------------------------+
  |  VERB ${verb}   NOUN ${noun}   (FLASHING)
  |  R1   +${oct(r1)}
  +-----------------------------+`);
}

// GOPERF1: "please perform" — flashes V50 N25 with a checklist code in R1
// and waits for the crew. In the AGC, the routine returns to a different
// address depending on the key pressed (see note 7 in
// Luminary099/DISPLAY_INTERFACE_ROUTINES.agc):
//   V34E (TERMINATE) -> return address +1
//   V33E (PROCEED)   -> return address +2
//   ENTR (ENTER)     -> return address +3
// Here we just return which one it was.
async function GOPERF1(checklistCode) {
  showDsky(50, 25, checklistCode);
  for (;;) {
    console.log(
      "  Commands: crank   (rotate the antenna; doesn't tell the computer)\n" +
      "            V33E    (PROCEED  - 'I did it')\n" +
      "            V34E    (TERMINATE)\n" +
      "            ENTR    (ENTER    - skip the check, carry on)"
    );
    const key = (await ask("  CREW> ")).trim().toUpperCase();
    if (key === "CRANK") {
      CHAN33 &= ~BIT6; // antenna now in position 1 -> bit reads 0
      console.log("  *creak creak* Antenna rotated to position 1.");
    } else if (key === "V34E" || key === "TERMINATE") {
      return "TERMINATE";
    } else if (key === "V33E" || key === "PROCEED") {
      return "PROCEED";
    } else if (key === "ENTR" || key === "ENTER") {
      return "ENTER";
    } else {
      console.log("  OPR ERR"); // what the real DSKY lit up on a bad key
    }
  }
}

// ---------------------------------------------------------------------------
// Routines the original code jumps to (stubbed)
// ---------------------------------------------------------------------------

function GOTOPOOH() {
  console.log("\n  GOTOPOOH: program terminated, back to P00 (idle).");
}

function SETPOS1() {
  console.log("\n  SETPOS1: landing radar initialized for position 1.");
}

function BURNBABY() {
  console.log("  BURNBABY: off to see the wizard... ignition sequence begins.");
}

// ---------------------------------------------------------------------------
// The ported logic
// ---------------------------------------------------------------------------

async function P63SPOT3() {
  // The AGC version is a loop made of jumps: PROCEED does TCF P63SPOT3,
  // which goes back to the top and reads the hardware bit again.
  for (;;) {
    // CA BIT6 / RAND CHAN33 / BZF P63SPOT4
    if (antennaInPosition1()) break; // fall through to P63SPOT4

    // CAF CODE500 / TC BANKCALL / CADR GOPERF1
    console.log("\n  ASTRONAUT: PLEASE CRANK THE SILLY THING AROUND");
    const response = await GOPERF1(CODE500);

    if (response === "TERMINATE") return GOTOPOOH(); // TCF GOTOPOOH
    if (response === "PROCEED") {                     // TCF P63SPOT3
      console.log("  Computer: Proceed, huh? Let's SEE IF HE'S LYING...");
      continue;
    }
    // ENTER: return to +3, which is P63SPOT4. No re-check of the antenna bit:
    // the crew can override the computer and go to ignition anyway.
    break;
  }
  P63SPOT4();
}

function P63SPOT4() {
  SETPOS1(); // TC BANKCALL / CADR SETPOS1
  BURNBABY(); // TC POSTJUMP / CADR BURNBABY
}

// ---------------------------------------------------------------------------

console.log("P63: BRAKING PHASE. Checking landing radar antenna position...");
P63SPOT3().finally(() => rl.close());
