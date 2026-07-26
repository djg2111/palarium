// Partner skills, sourced end to end from the game's own tables.
//
// Until now ps.rl / ps.re (the five-rank scaling values) and ps.t (the effect
// tags) were the last pre-1.0 carry-over in js/data.js, because nothing seemed
// to link a pal to its partner-skill values. The link is
// DT_PartnerSkillParameter, keyed by tribe:
//
//   PassiveSkills[rank].SkillAndParametersArray[].SkillName.Key
//       -> a row in DT_PassiveSkill_Main, whose EffectType1..4 / EffectValue1..4
//          are that rank's effects and whose TargetType1..4 say who they land
//          on. Five entries, one per partner-skill rank.
//   TextReferencePassiveSkills[rank].PassiveSkillIds[n]
//       -> the rows the description quotes, which is what the
//          {ReferencePassive1_EffectValue1} placeholders resolve against.
//   ActiveSkill.ActiveSkill_MainValueByRank / _OverWriteCoolTimeByRank /
//   _OverWriteEffectTimeByRank
//       -> the triggered half of the skill: power, cooldown, duration.
//
// Rebuilding the shipped tables from this reproduces all 215 of them exactly
// (tools/probe-partner.js), which is what makes it safe to also generate the
// 39 that were missing.
//
// TargetType matters as much as the effect: Sekhmet has two CraftSpeed effects
// in the same rank, +20% ToBaseCampPal and +30% ToSelf, and the carried-over
// data only ever had one of them. It is also what tells a base aura from a
// party buff without reading the prose.

// who an effect lands on -> the code shipped in ps.rt, and how it reads
const TARGETS = {
  ToSelf: ['s', 'this pal'],
  ToTrainer: ['p', 'you'],
  ToSelfAndTrainer: ['sp', 'you and this pal'],
  ToOtomo: ['o', 'your party pals'],
  ToActiveOtomo: ['a', 'the pal fighting with you'],
  ToBaseCampPal: ['b', 'every pal at the base'],
  ToBuildObject: ['f', 'base facilities'],
};
// an effect on base pals or base facilities is a base aura, by definition
const BASE_TARGETS = new Set(['b', 'f']);

const ELEM = {Normal: 'Neutral', Fire: 'Fire', Water: 'Water', Electricity: 'Electric',
  Leaf: 'Grass', Dark: 'Dark', Dragon: 'Dragon', Earth: 'Ground', Ice: 'Ice'};
// status ailments under the names the game's own descriptions use — every one
// of these is quoted verbatim from an "inflict X 2" / "afflicted with X" line
const AILMENT = {Burn: 'Burn', Darkness: 'Blind', Electrical: 'Electrify', Freeze: 'Freeze',
  IvyCling: 'Ivy-Covered', Muddy: 'Muddy', Wetness: 'Soak', Poison: 'Poison', Stun: 'Stun'};
const WORK_TAG = {Collection: 'Collection++', Cool: 'Cool++', Deforest: 'Deforest++',
  EmitFlame: 'Emit Flame++', GenerateElectricity: 'Generate Electricity++',
  Handcraft: 'Handcraft++', Mining: 'Mining++', MonsterFarm: 'Monster Farm++',
  ProductMedicine: 'Product Medicine++', Seeding: 'Seeding++', Transport: 'Transport++',
  Watering: 'Watering++'};
const WORK_NAME = {Collection: 'Gathering', Cool: 'Cooling', Deforest: 'Lumbering',
  EmitFlame: 'Kindling', GenerateElectricity: 'Generating Electricity', Handcraft: 'Handiwork',
  Mining: 'Mining', MonsterFarm: 'Farming', ProductMedicine: 'Medicine Production',
  Seeding: 'Planting', Transport: 'Transporting', Watering: 'Watering'};

// units: '%' percent · '' a bare game number · 'lv' a level/rank step
//        's' seconds · 'x' a damage multiplier · 'flag' on/off, no number
// tag: what the browsable index filters by; a function when the target changes
// the answer (the same ShotAttack row is the pal's attack or the player's).
const E = (l, u, tag) => ({l, u, tag});
const EFFECTS = {
  // --- work -------------------------------------------------------------
  CraftSpeed: E('Work speed', '%', 'Craft Speed++'),
  Logging: E('Lumbering speed', '%', 'Logging++'),
  Mining: E('Mining speed', '%', 'Mining++'),
  CollectItemDrop: E('Gathering yield', '%', 'Collection++'),
  ItemWeightReduction: E('Carry capacity', '%', 'Carry Capacity++'),
  MaxInventoryWeight: E('Carry capacity', '', 'Carry Capacity++'),
  FarmCropGrowupSpeed: E('Crop growth speed', '%', 'Farming++'),
  FarmCropHarvestNumRate: E('Crop harvest', '%', 'Farming++'),
  ItemCorruptionSpeedRate: E('Food spoilage rate', '%', 'Slower Spoilage'),
  // --- breeding ---------------------------------------------------------
  BreedSpeed_InBaseCamp: E('Breeding farm egg speed', '%', 'Breeding++'),
  PalEggHatchingSpeed: E('Egg hatching speed', '%', 'Breeding++'),
  EggObtainExtraEgg: E('Chance of an extra egg', '%', 'Breeding++'),
  EggAlphaConversion: E('Chance the egg is an alpha', '%', 'Breeding++'),
  // --- combat ------------------------------------------------------------
  ShotAttack: E('Attack', '%', t => t === 'p' ? 'Player Atk++' : 'Attack++'),
  Defense: E('Defense', '%', t => t === 'p' ? 'Player Def++' : 'Defense++'),
  AttackSpeedUp: E('Attack speed', '%', 'Attack Speed++'),
  LifeSteal: E('Life steal', '%', 'Life Steal'),
  BodyPartsWeakDamage: E('Weak-point damage', '%', 'Weak Point Dmg++'),
  DamageRateByEquippedWeapon: E('Weapon damage', '%', 'Weapon Dmg++'),
  DamageUpToNonBattleEnemy: E('Damage from stealth', '%', 'Sneak Dmg++'),
  DamageUp_LastBullet: E('Last-bullet damage', '%', 'Weapon Dmg++'),
  ReloadSpeedUp: E('Reload speed', '%', 'Reload Speed++'),
  Player_ArrowExplosion: E('Explosive arrows', '%', 'Weapon Dmg++'),
  AttackRateHPThreshold: E('Attack while above half health', '%', 'Player Atk++'),
  PlayerLowHealthBlast: E('Blast power at low health', '', 'Player Atk++'),
  BulletHit_StackBuff: E('Damage per hit stacked', '%', 'Player Atk++'),
  DefeatEnemy_StackBuff: E('Damage per kill stacked', '%', 'Player Atk++'),
  DamageUpPartnerSkillAttack: E('Partner-skill attack damage', '%', 'Player Atk++'),
  DefeatEnemy_ActiveSkillCoolTime_Decrease: E('Cooldown cut on a kill', '%', 'Cooldown--'),
  PartnerSkillCoolTime_Decrease: E('Partner-skill cooldown', '%', 'Cooldown--'),
  AvoidDurationUp_PartnerSkill: E('Dodge window', '', 'Dodge++'),
  ShieldDamageCutRate: E('Shield damage cut', '%', 'Shield++'),
  PlayerShield_RecoverStartTimeRate: E('Shield recharge delay', '%', 'Shield++'),
  RecoverHPOnHPThreshold: E('Health restored when low', '%', 'HP Regen'),
  Regene_HP_Rate: E('Health regenerated per second', '%', 'HP Regen'),
  Regene_Stomatch_Hungriest: E('Stomach refilled when starving', '', 'HP Regen'),
  PlayerInflictEffect_MeleeHitBarrier: E('Barrier from melee hits', '', 'Shield++'),
  PlayerInflictEffect_WeakPointHit_DamageUp: E('Weak-point damage', '%', 'Weak Point Dmg++'),
  PlayerElementStepAttack_Leaf: E('Grass step-attack power', '', 'Grass Dmg++'),
  // Capture++ is capture *power* only. Saving a sphere and copying a passive
  // are capture-adjacent, not the thing someone filtering for capture rate is
  // looking for, so they get their own tags.
  SyncroPassiveWhenCapture: E('Chance to copy a passive on capture', '%', 'Passive on Capture'),
  SphereRecovery: E('Chance the sphere is returned', '%', 'Sphere Recovery'),
  // --- movement ----------------------------------------------------------
  MoveSpeed: E('Move speed', '%', 'Move Speed++'),
  MoveSpeed_Grass: E('Move speed in grass', '%', 'Move Speed++'),
  MoveSpeed_Ground: E('Move speed on the ground', '%', 'Move Speed++'),
  MoveSpeed_Snow: E('Move speed on snow', '%', 'Move Speed++'),
  SwimSpeed: E('Swim speed', '%', 'Swim Speed++'),
  ClimbMoveSpeedRate: E('Climb speed', '%', 'Climb Speed++'),
  JumpPower_Increase: E('Jump power', '%', 'Jump++'),
  JumpCount_Increase: E('Extra mid-air jumps', 'lv', 'Jump++'),
  AirDash: E('Air dash', 'flag', 'Jump++'),
  LowGravity: E('Reduced gravity', 'flag', 'Jump++'),
  FallDamageRate: E('No fall damage', 'flag', 'Fall Damage Immunity'),
  EnemySightDetectionRate: E('Enemy detection range', '%', 'Stealth++'),
  CurveType: E('Spheres home in on pals', 'flag', 'Homing Spheres'),
  // --- survival & upkeep --------------------------------------------------
  FullStomatch_Decrease: E('Hunger rate', '%', 'Slower Hunger'),
  Sanity_Decrease: E('Sanity loss rate', '%', 'Slower Sanity Loss'),
  TemperatureResist_Cold: E('Cold resistance', 'lv', 'Cold Resist'),
  TemperatureResist_Heat: E('Heat resistance', 'lv', 'Heat Resist'),
  ExplosionResist: E('Explosion damage taken', '%', 'Explosion Resist'),
  LavaDamageInvalid: E('Immune to lava damage', 'flag', 'Lava Immunity'),
  InvalidToxicGas: E('Immune to toxic gas', 'flag', 'Poison Resist'),
  Defuser_ExplosiveSpore: E('Defuses explosive spores', 'flag', 'Explosion Resist'),
  EquipmentDurabilityRate: E('Equipment durability', '%', 'Durability++'),
  PalExp_Increase: E('Pal EXP', '%', 'Pal EXP++'),
  LifeDrainPower_AttackUp: E('Attack rises as health drains', 'flag', 'Player Atk++'),
  // --- loot ---------------------------------------------------------------
  GainItemDrop: E('Extra drops', '%', 'Extra Drops'),
  MeatCutAddItemDrop: E('Extra meat from butchering', '%', 'Extra Drops'),
  // --- fishing -------------------------------------------------------------
  Fishing_ItemAddDrop: E('Items reeled in', '%', 'Fishing++'),
  Fishing_EnemyAddDrop: E('Drops from pals you fish up', '%', 'Fishing++'),
  FishingSalvage_ItemDrop: E('Salvage yield', '%', 'Fishing++'),
  Fishing_FailedAmountDown: E('Loss on a failed catch', '%', 'Fishing++'),
  Fishing_StartProgressAdd: E('Head start on the catch bar', '%', 'Fishing++'),
  Fishing_SuccessAmountUp: E('Catch bar progress', '%', 'Fishing++'),
  Fishing_GoodTalentPalProbability: E('Chance of a high-talent catch', '%', 'Fishing++'),
  // --- passive-only effect types -------------------------------------------
  // No partner skill uses these, but DT_PassiveSkill_Main's displayable rows do,
  // and the passive list needs the same unit call: the extractor used to print
  // "%" on all of them, which turned "+2 jumps" into "+2%".
  ActiveSkillCoolTime_Decrease: E('Skill cooldown reduction', '%', null),
  AutoHPRegeneRate: E('HP regeneration', '%', null),
  BreedSpeed: E('Breeding speed', '%', null),
  MaxHP: E('Max HP', '%', null),
  PalSP_Increase: E('Pal stamina', '%', null),
  PlayerSP_DecreaseRate: E('Player stamina drain', '%', null),
  SelfDeathAddItemDrop: E('Extra drops when defeated', '%', null),
  ShopBuyPrice_Money_Increase: E('Buying price', '%', null),
  ShopSellPrice_Money_Increase: E('Selling price', '%', null),
  RideJumpCount_Increase: E('Extra mount jumps', 'lv', null),
  KnockbackInvalid_ForPassiveSkill: E('Immune to knockback', 'flag', null),
  LeanBackInvalid_ForPassiveSkill: E('Immune to flinching', 'flag', null),
  NightOwl: E('Works through the night', 'flag', null),
  Nocturnal: E('Nocturnal — works at night', 'flag', null),
  NonKilling: E('Never lands the killing blow', 'flag', null),
  WorldTreeDecayImmunity: E('Immune to World Tree decay', 'flag', null),
};
// element families — mechanical, so generated rather than written out nine times
for (const [k, name] of Object.entries(ELEM)) {
  EFFECTS['ElementBoost_' + k] = E(name + ' damage', '%', name + ' Dmg++');
  EFFECTS['ElementResist_' + k] = E(name + ' resistance', '%', name + ' Resist++');
  EFFECTS['ElementAddItemDrop_' + k] = E(name + ' pals drop more', '%', name + ' Drop Bonus');
  EFFECTS['ElementBoostWeakness_' + k] = E('Damage to ' + name + '-weak targets', '%', name + ' Weakness Dmg++');
  // Element<X> switches your attack element — a change, not a quantity
  EFFECTS['Element' + k] = E('Your attacks become ' + name, 'flag', 'Attack Element: ' + name);
}
for (const [k, name] of Object.entries(AILMENT)) {
  EFFECTS['AdditionalEffect_' + k] = E(name + ' buildup', 'lv', 'Inflict ' + name);
  EFFECTS['ResistAdditionalEffect_' + k] = E(name + ' resistance', '%', name + ' Resist');
  EFFECTS['DamageRateIfDefender_' + k] = E('Damage to ' + name + 'ed targets', '%', 'Damage vs ' + name);
  EFFECTS['CaptureLevelUpIfTarget_' + k] = E('Capture power vs ' + name + 'ed pals', 'lv', 'Capture++');
}
EFFECTS.DamageRateIfDefender_Wetness = E('Damage to Soaked targets', '%', 'Damage vs Soak');
EFFECTS.DamageRateIfDefender_IvyCling = E('Damage to Ivy-Covered targets', '%', 'Damage vs Ivy-Covered');
EFFECTS.DamageRateIfDefender_Darkness = E('Damage to Blinded targets', '%', 'Damage vs Blind');
EFFECTS.CaptureLevelUpIfTarget_IvyCling = E('Capture power vs Ivy-Covered pals', 'lv', 'Capture++');
EFFECTS.CaptureLevel_SneakBonus = E('Capture power from a back attack', 'lv', 'Capture++');
EFFECTS.PlayerInflictEffect_AttackWet_ApplyFreeze = E('Soaked targets freeze', 'flag', 'Inflict Freeze');
for (const [k, v] of Object.entries({
  AttackBurning_ApplyExplosion: ['Burning targets explode', 'Inflict Burn'],
  AttackBurning_ApplyFireVortex: ['Burning targets spawn a fire vortex', 'Inflict Burn'],
  AttackElectrified_ApplySpark: ['Electrified targets spark', 'Inflict Electrify'],
  AttackIvyCling_ApplyExplosion: ['Ivy-Covered targets explode', 'Inflict Ivy-Covered'],
  AttackPoisoned_ApplyAttackDown: ['Poisoned targets lose attack', 'Inflict Poison'],
})) EFFECTS['PlayerInflictEffect_' + k] = E(v[0], '%', v[1]);
for (const [k, name] of Object.entries(WORK_NAME)) {
  EFFECTS['WorkSuitabilityAddRank_' + k] = E(name + ' suitability', 'lv', WORK_TAG[k]);
}

// The triggered half of the skill. ActiveSkill_MainValue_Overview_EditorOnly is
// the developers' own note about what the number is; it is Japanese and only
// these ten values occur. "None" is excluded on purpose — it covers unrelated
// things (Herbil's heal, Penking Lux's four-entry array) with no way to tell
// them apart, so labelling those would be inventing a label.
const ACTIVE_LABEL = {
  '威力': ['Skill power', ''],
  'ハンマー殴りの技威力': ['Hammer attack power', ''],
  '威力倍率': ['Damage multiplier', 'x'],
  '威力の倍率': ['Damage multiplier', 'x'],
  '技威力の倍率': ['Damage multiplier', 'x'],
  '技の倍率': ['Damage multiplier', 'x'],
  '回復量実数値': ['Health restored', '%'],
  'ジャンプ力に影響': ['Launch power', ''],
  '開錠可能な宝箱のグレード': ['Chest grade it can open', ''],
};

const ev = s => String(s ?? '').split('::').pop();

function makePartnerSkills({ psp, main, warn = console.warn }) {
  const mainLC = new Map(Object.entries(main).map(([k, v]) => [k.toLowerCase(), v]));
  const pspLC = new Map(Object.entries(psp).map(([k, v]) => [k.toLowerCase(), v]));
  const unknown = new Set(), conflicts = [];

  // a DT_PassiveSkill_Main row -> [[EffectType, value, targetCode], …]
  const effectsOf = key => {
    const g = mainLC.get(String(key).toLowerCase());
    if (!g) { unknown.add('row:' + key); return []; }
    const out = [];
    for (let i = 1; i <= 4; i++) {
      const t = ev(g['EffectType' + i]);
      if (!t || t === 'no' || t === 'None') continue;
      const tgt = ev(g['TargetType' + i]);
      if (!TARGETS[tgt]) unknown.add('target:' + tgt);
      out.push([t, g['EffectValue' + i] ?? 0, (TARGETS[tgt] || ['?'])[0]]);
    }
    return out;
  };

  const referenced = (row, n, m) => {
    const ids = ((row.TextReferencePassiveSkills || [])[0] || {}).PassiveSkillIds || [];
    const g = mainLC.get(String(ids[n - 1]?.Key ?? '').toLowerCase());
    return g ? g['EffectValue' + m] : null;
  };

  return {
    unknownTypes: unknown,
    conflicts,
    // {rl, ru, rt, re, t} for one pal
    build(key, isRidden, isCollared, picksUpItems) {
      const row = pspLC.get(String(key).toLowerCase());
      const tags = new Set();
      const empty = () => {
        if (isRidden) tags.add('Mount');
        if (isCollared) tags.add('Collar Pal');
        if (picksUpItems) tags.add('Item Pickup');
        return {rl: [], ru: [], rt: [], re: [], t: [...tags].sort()};
      };
      if (!row) return empty();

      // A row is one (effect type, target) pair: Sekhmet's +20% work speed for
      // base pals and its +30% for itself are the same type and must not merge.
      const idx = new Map(), rl = [], ru = [], rt = [], re = [[], [], [], [], []];
      const rowFor = (type, tgt) => {
        const id = type + '|' + tgt;
        if (idx.has(id)) return idx.get(id);
        const meta = EFFECTS[type];
        if (!meta) { unknown.add(type); return -1; }
        const i = rl.length;
        rl.push(meta.l); ru.push(meta.u); rt.push(tgt); idx.set(id, i);
        tags.add(typeof meta.tag === 'function' ? meta.tag(tgt) : meta.tag);
        if (BASE_TARGETS.has(tgt)) tags.add('Base Aura');
        return i;
      };
      const ranks = row.PassiveSkills || [];
      // pass one claims a stable row order (rank 1 first, then what later ranks
      // add), pass two fills values — an effect that only starts at rank 2
      // leaves rank 1 empty, which is a fact about the skill, not a gap
      for (const rank of ranks) {
        for (const s of rank.SkillAndParametersArray || []) {
          for (const [type, , tgt] of effectsOf(s.SkillName?.Key)) rowFor(type, tgt);
        }
      }
      ranks.forEach((rank, ri) => {
        if (ri > 4) return;
        const put = new Map();
        for (const s of rank.SkillAndParametersArray || []) {
          for (const [type, val, tgt] of effectsOf(s.SkillName?.Key)) {
            const i = idx.get(type + '|' + tgt);
            if (i === undefined || i < 0) continue;
            // the game lists a few effects twice in one rank with the same
            // value (Katress, Fenglope Lux) — one row, not two
            if (put.has(i)) {
              if (put.get(i) !== val) conflicts.push(`${key} rank ${ri + 1}: ${type}/${tgt} is both ${put.get(i)} and ${val}`);
              continue;
            }
            put.set(i, val);
            re[ri].push([i, val]);
          }
        }
      });

      // ---- the triggered half: power / duration / cooldown, each by rank ----
      const a = row.ActiveSkill || {};
      const addActive = (vals, label, unit) => {
        if (!vals || vals.length !== 5) return;   // a partial array isn't a rank table
        if (new Set(vals).size === 1) return;     // constant: nothing to show per rank
        const i = rl.length;
        rl.push(label); ru.push(unit); rt.push('p');
        vals.forEach((v, ri) => re[ri].push([i, v]));
      };
      const ov = ACTIVE_LABEL[a.ActiveSkill_MainValue_Overview_EditorOnly];
      if (ov) addActive(a.ActiveSkill_MainValueByRank, ov[0], ov[1]);
      addActive(a.ActiveSkill_OverWriteEffectTimeByRank, 'Effect duration', 's');
      addActive(a.ActiveSkill_OverWriteCoolTimeByRank, 'Cooldown', 's');

      // "Can be ridden" and "appears near the player" are prose, not effects.
      // These reproduce the carried-over Mount (121), Collar Pal (6) and the
      // prose half of Item Pickup exactly, in both directions.
      if (isRidden) tags.add('Mount');
      if (isCollared) tags.add('Collar Pal');
      // the collar pals that fetch items say so in prose, not in an effect row
      if (picksUpItems) tags.add('Item Pickup');
      tags.delete(undefined); tags.delete(null);
      return {rl, ru, rt, re: re.some(r => r.length) ? re : [], t: [...tags].sort()};
    },

    // "increases Attack by {ReferencePassive1_EffectValue1}%" — the game ships
    // these tokens unresolved in 19 descriptions. Each names a passive row or
    // an active-skill array this table can look up.
    resolve(key, text) {
      const row = pspLC.get(String(key).toLowerCase());
      if (!row || !/\{/.test(text)) return text;
      const a = row.ActiveSkill || {};
      return text.replace(/\{([A-Za-z0-9_]+)\}/g, (whole, token) => {
        const m = token.match(/^ReferencePassive(\d+)_EffectValue(\d+)$/);
        if (m) {
          const v = referenced(row, +m[1], +m[2]);
          if (v != null) return String(v);
        }
        const arr = {ActiveSkillOverWriteEffectTime: a.ActiveSkill_OverWriteEffectTimeByRank,
          ActiveSkillOverWriteCoolTime: a.ActiveSkill_OverWriteCoolTimeByRank,
          ActiveSkillMainValue: a.ActiveSkill_MainValueByRank}[token];
        if (arr && arr[0] != null) return String(arr[0]);
        warn(`  unresolved placeholder ${whole} on ${key}`);
        return whole;
      });
    },
  };
}

// The units above are a judgement call per effect type, so they get tested
// against the prose: if a description spells the rank-1 value as "20%" the unit
// must be '%', and if it spells it bare ("by 100", "+2") it must not be.
function checkUnits(pals) {
  const bad = [];
  for (const p of pals) {
    const d = String(p.ps.d || '').replace(/\s+/g, ' ');
    ((p.ps.re || [])[0] || []).forEach(([i, v]) => {
      const unit = p.ps.ru[i], a = Math.abs(v);
      if (unit === 'flag' || unit === 's' || unit === 'x') return;
      const pct = new RegExp('(^|[^0-9])' + a + '\\s*%').test(d);
      const flat = !pct && new RegExp('(^|[^0-9.])' + a + '([^0-9%]|$)').test(d);
      if (pct && unit !== '%') bad.push(`${p.n}: "${p.ps.rl[i]}" is ${unit || 'unitless'} but the text says ${a}%`);
      if (flat && unit === '%') bad.push(`${p.n}: "${p.ps.rl[i]}" is % but the text says a bare ${a}`);
    });
  }
  return bad;
}

// The unit for an effect type, for the passive list as well as the rank tables.
// Unknown types return null so the caller can fail loudly rather than guess.
const EFFECT_BY_LC = new Map(Object.entries(EFFECTS).map(([k, v]) => [k.toLowerCase(), v]));
const unitOf = type => EFFECT_BY_LC.get(String(type).toLowerCase())?.u ?? null;

module.exports = { makePartnerSkills, checkUnits, unitOf, EFFECTS, TARGETS };
