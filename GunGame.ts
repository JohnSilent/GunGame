// To be implemented: 
// x Kill with melee weapon steals a level from killed enemy and a hole level 
//      Implemented in Version 0.2.2
// - Add messages for Start, Taken the lead, Knifed, Close to winning, Win
// - Randomize weapon list at start of game, depending on numberOfWeapons.
// - Automatic Spawn at the Spawnpoint furthest away from enemies 
// x Add Basic Scoreboard showing Level, Kills, Deaths 
//      Implemented in Version 0.3.0
// - Add UI to display current level, weapon and kills needed to level up, next weapon 
// - Add sound effects for leveling up and winning



/* Config */
const VERSION = [0, 3, 0];
const debug = true;
let gameEnded: boolean = false;
let gameStarted = false;  
let scoreboard: Scoreboard | null = null;
const spawners: mod.Vector[] = [];

interface GameModeConfig {
    maxLevel: number;
    GunGameSet: GunGameSet;
    timeLimit: number;
    freezeTime: number;
//   progressStageEarly: number;
//   progressStageMid: number;
//   progressStageLate: number;
    team1ID: number;
    team2ID: number;
    hqRoundStartTeam1: number;
    hqRoundStartTeam2: number;
    hqInProgressTeam1: number;
    hqInProgressTeam2: number;
    respawnAreaTriggerID: number;
    //maxStartingAmmo: boolean;
    startSpawnPointID: number;
}

/* Types */
class JsPlayer {
    player: mod.Player;
    playerId: number;
    LastDeployTime: number = -1;
    isAi: boolean;
    // score:
    killsInLevel: number = 0;
    level: number = 0;
    kills: number = 0;
    deaths: number = 0;
    IsDeployed: boolean = false; 

    // static array to hold all player instances
    static playerInstances: mod.Player[] = []
    static jsPlayerInstances: JsPlayer[] = []

    // declare dictionary with int keys
    static #allJsPlayers: { [key: number] : JsPlayer }  = {};

    constructor(player: mod.Player) {
        this.player = player;
        this.playerId = mod.GetObjId(player);
        JsPlayer.playerInstances.push(this.player);
        JsPlayer.jsPlayerInstances.push(this);
        this.isAi = mod.GetSoldierState(this.player, mod.SoldierStateBool.IsAISoldier);
        if (debug) {console.log("Adding Player [", mod.GetObjId(this.player), "] Creating JS Player: ", JsPlayer.playerInstances.length)};
    }


    static get(player: mod.Player) {
        if (mod.GetObjId(player) > -1) {
            let index = mod.GetObjId(player);
            let jsPlayer = this.#allJsPlayers[index];
            if (!jsPlayer) {
                jsPlayer = new JsPlayer(player);
                this.#allJsPlayers[index] = jsPlayer;
            }
            return jsPlayer;
        }
        return undefined;
    }

    public GetCurrentWeaponSet(): WeaponLevelSet{
        return GAMEMODE_CONFIG.GunGameSet.WeaponSets[this.level];
    }

    public applyWeapon(){
        const weaponSet = this.GetCurrentWeaponSet();
        if (debug) console.log("applyWeapon: give Weapon ", weaponSet.Weapon?.toString(), "to ", this.playerId);
        if (weaponSet.Weapon) {
            if (weaponSet.WeaponPack)
                mod.AddEquipment(this.player, weaponSet.Weapon, weaponSet.WeaponPack, weaponSet.InventorySlot);
            else
                mod.AddEquipment(this.player, weaponSet.Weapon, weaponSet.InventorySlot);
        } else if (weaponSet.Gadget) {
            mod.AddEquipment(this.player, weaponSet.Gadget, weaponSet.InventorySlot);
        }
        mod.ForceSwitchInventory(this.player, weaponSet.InventorySlot);
        if (debug) console.log("applyWeapon: given Weapon ", weaponSet.Weapon?.toString(), "to ", this.playerId);
    }

    public removeWeapon(){
        const weaponSet = this.GetCurrentWeaponSet();
        if (debug) console.log("removeWeapon: remove ", weaponSet.InventorySlot.toString(), " from ", this.playerId);
        mod.RemoveEquipment(this.player, weaponSet.InventorySlot);
        if (debug) console.log("removeWeapon: removed ", weaponSet.InventorySlot.toString(), " from ", this.playerId);
    }

    private adjustLevel(adjustment: number){
        this.level = this.level + adjustment;
        scoreboard?.update(this);
        if (debug) console.log("adjustLevel: Adjusted Level of", this.playerId, "to", this.level);

    }

    public async addLevel(){
        this.removeWeapon();
        this.adjustLevel(1);
        if (debug) console.log("addLevel: Player ", this.playerId, "advanced to level ", this.level);
        if (await this.checkWinCondition()){
            return;
        }
        this.applyWeapon();
        this.killsInLevel = 0;
    }

    public demote(){
        this.removeWeapon();
        this.adjustLevel(-1);
        if (debug) console.log("demote: Player", this.playerId, "demoted to Level", this.level);
        // leave killsInLevel unchanged as a bonus
        this.applyWeapon();
    }

   
    public async addKillForCurrentLevel(){
        this.killsInLevel++;
        if (this.killsInLevel >= this.GetCurrentWeaponSet().KillsNeeded) {
            this.killsInLevel = 0;
            await this.addLevel();
        }
    }

    public async checkWinCondition(): Promise<boolean> {
        if (this.level >= GAMEMODE_CONFIG.maxLevel) {
            if (debug) console.log("CheckWinCondition: Player ", this.playerId, "won! Ending Game");
            gameEnded = true;
            JsPlayer.jsPlayerInstances.forEach(player => {
                if (player.isAi){
                    mod.AIIdleBehavior(player.player);
                    mod.AIEnableTargeting(player.player, false);
                    mod.AIEnableShooting(player.player, false);
                } else {
                    mod.EnableAllInputRestrictions(player.player, true);
                }
            });
            mod.DeployAllPlayers();
            await mod.Wait(8);
            mod.EndGameMode(this.player);
            return true;
        }
        return false;
    }

}

class WeaponLevelSet {
    KillsNeeded: number;
    InventorySlot: mod.InventorySlots;
    Weapon: mod.Weapons | undefined;
    Gadget: mod.Gadgets | undefined;
    Attachments: mod.WeaponAttachments[] | undefined;
    StartingAmmo: number;
    WeaponPack: mod.WeaponPackage | undefined;

    constructor(killsNeeded: number, invSlot: mod.InventorySlots, weapon: mod.Weapons | undefined, gadget: mod.Gadgets | undefined = undefined, startingAmmo: number = -1, attachments: mod.WeaponAttachments[] | undefined = undefined){
        this.KillsNeeded = killsNeeded;
        this.InventorySlot = invSlot;
        this.Weapon = weapon;
        this.Gadget = gadget;
        this.Attachments = attachments;
        this.StartingAmmo = startingAmmo;
        this.WeaponPack = this.CreateWeaponPack();
    }

    public CreateWeaponPack(): mod.WeaponPackage | undefined {
        if (this.Attachments) {
            var weaponPack = mod.CreateNewWeaponPackage();
            this.Attachments.forEach(attachment => {
                mod.AddAttachmentToWeaponPackage(attachment, weaponPack);
            });
            return weaponPack;
        }
        return undefined;
    }
}

interface GunGameSet {
    WeaponSets: WeaponLevelSet[]
}

const StandardGunGame: GunGameSet = {
    WeaponSets: [
        new WeaponLevelSet(2, mod.InventorySlots.SecondaryWeapon, mod.Weapons.Sidearm_M45A1, undefined, 12, [
                mod.WeaponAttachments.Scope_Iron_Sights,
            ]),
        new WeaponLevelSet(2, mod.InventorySlots.SecondaryWeapon, mod.Weapons.Sidearm_P18, undefined, 18, [
                mod.WeaponAttachments.Scope_Iron_Sights,
                mod.WeaponAttachments.Bottom_Flashlight,
            ]),
        new WeaponLevelSet(2, mod.InventorySlots.SecondaryWeapon, mod.Weapons.Sidearm_M44, undefined, 6, [
                mod.WeaponAttachments.Scope_Iron_Sights,
                mod.WeaponAttachments.Barrel_837_Long,
            ]),
        new WeaponLevelSet(2, mod.InventorySlots.PrimaryWeapon, mod.Weapons.SMG_PW7A2, undefined, 41, [
                mod.WeaponAttachments.Scope_Iron_Sights,
                mod.WeaponAttachments.Muzzle_Long_Suppressor,
            ]),
        new WeaponLevelSet(2, mod.InventorySlots.PrimaryWeapon, mod.Weapons.SMG_USG_90, undefined, 51, [
                mod.WeaponAttachments.Scope_Mini_Flex_100x,
            ]),
        new WeaponLevelSet(2, mod.InventorySlots.PrimaryWeapon, mod.Weapons.Shotgun_M1014, undefined, 7, [
                mod.WeaponAttachments.Scope_Iron_Sights,
                mod.WeaponAttachments.Ammo_Buckshot,
            ]),
        new WeaponLevelSet(2, mod.InventorySlots.PrimaryWeapon, mod.Weapons.Shotgun__185KS_K, undefined, 9, [
                mod.WeaponAttachments.Scope_Iron_Sights,
                mod.WeaponAttachments.Ammo_Flechette,
            ]),
        new WeaponLevelSet(2, mod.InventorySlots.PrimaryWeapon, mod.Weapons.AssaultRifle_M433, undefined, 31, [
                mod.WeaponAttachments.Scope_Mini_Flex_100x,
                mod.WeaponAttachments.Right_5_mW_Red,
            ]),
        new WeaponLevelSet(2, mod.InventorySlots.PrimaryWeapon, mod.Weapons.AssaultRifle_TR_7, undefined, 31, [
                mod.WeaponAttachments.Scope_SU_123_150x,
                mod.WeaponAttachments.Right_5_mW_Red,
                mod.WeaponAttachments.Bottom_Classic_Vertical,
                mod.WeaponAttachments.Magazine_30rnd_Magazine,
            ]),
        new WeaponLevelSet(2, mod.InventorySlots.PrimaryWeapon, mod.Weapons.Carbine_GRT_BC, undefined, 31, [
                mod.WeaponAttachments.Scope_Mini_Flex_100x,
                mod.WeaponAttachments.Right_5_mW_Red,
                mod.WeaponAttachments.Bottom_Classic_Vertical,
            ]),
        new WeaponLevelSet(2, mod.InventorySlots.PrimaryWeapon, mod.Weapons.AssaultRifle_SOR_556_Mk2, undefined, 31, [
                mod.WeaponAttachments.Scope_SU_123_150x,
                mod.WeaponAttachments.Right_5_mW_Red,
                mod.WeaponAttachments.Bottom_Classic_Vertical,
            ]),
        new WeaponLevelSet(2, mod.InventorySlots.PrimaryWeapon, mod.Weapons.LMG_L110, undefined, 100, [
                mod.WeaponAttachments.Scope_BF_2M_250x,
                mod.WeaponAttachments.Right_5_mW_Red,
                mod.WeaponAttachments.Bottom_Classic_Vertical,
            ]),
        new WeaponLevelSet(2, mod.InventorySlots.PrimaryWeapon, mod.Weapons.AssaultRifle_L85A3, undefined, 37, [
                mod.WeaponAttachments.Scope_PVQ_31_400x,
                mod.WeaponAttachments.Barrel_646mm_Cut,
                mod.WeaponAttachments.Bottom_Classic_Vertical,
                mod.WeaponAttachments.Magazine_36rnd_Magazine,
            ]),
        new WeaponLevelSet(2, mod.InventorySlots.PrimaryWeapon, mod.Weapons.DMR_M39_EMR, undefined, 21, [
                mod.WeaponAttachments.Scope_PVQ_31_400x,
                mod.WeaponAttachments.Bottom_Classic_Vertical,
                mod.WeaponAttachments.Muzzle_Flash_Hider,
            ]),
        new WeaponLevelSet(2, mod.InventorySlots.PrimaryWeapon, mod.Weapons.Sniper_SV_98, undefined, 11, [
                mod.WeaponAttachments.Scope_PVQ_31_400x,
                mod.WeaponAttachments.Right_5_mW_Red,
                mod.WeaponAttachments.Ergonomic_DLC_Bolt,
            ]),
        new WeaponLevelSet(1, mod.InventorySlots.GadgetOne, undefined, mod.Gadgets.Launcher_High_Explosive),
        new WeaponLevelSet(1, mod.InventorySlots.MeleeWeapon, undefined, mod.Gadgets.Melee_Combat_Knife)
    ]
}


class Scoreboard {
    //leadingPlayer: JsPlayer | null = null;
    constructor() {
        mod.SetScoreboardType(mod.ScoreboardType.CustomFFA);
        mod.SetScoreboardHeader(mod.Message(mod.stringkeys.scoreboard.header));
        mod.SetScoreboardColumnNames(
            mod.Message(mod.stringkeys.scoreboard.LVL),
            mod.Message(mod.stringkeys.scoreboard.KillsInLvl),
            mod.Message(mod.stringkeys.scoreboard.Kills),
            mod.Message(mod.stringkeys.scoreboard.Deaths)
        );
        mod.SetScoreboardColumnWidths(40, 40, 40, 40);
        }
    public update(jsPlayer: JsPlayer){
        mod.SetScoreboardPlayerValues(jsPlayer.player, jsPlayer.level, jsPlayer.killsInLevel, jsPlayer.kills, jsPlayer.deaths);
        mod.SetGameModeScore(jsPlayer.player, jsPlayer.level);
    }

    public initializeOnGameStart(){
        JsPlayer.jsPlayerInstances.forEach(player => {
            this.update(player);
        });
    }
}

// -------------------------------
// Helper Functions
// -------------------------------

function CheckCorrectPlayerWeaponEquipped(jsPlayer: JsPlayer): boolean {
    if (!jsPlayer.IsDeployed || mod.GetMatchTimeElapsed() - jsPlayer.LastDeployTime < 2)
        return true;
    const playerWeaponSet = jsPlayer.GetCurrentWeaponSet();
    const isCorrectSlotActive = mod.IsInventorySlotActive(jsPlayer.player, playerWeaponSet.InventorySlot);
    let correctWeaponEquipped = false;
    if (playerWeaponSet.Weapon) {
        correctWeaponEquipped = mod.HasEquipment(jsPlayer.player, playerWeaponSet.Weapon);
    } else if (playerWeaponSet.Gadget){
        correctWeaponEquipped = mod.HasEquipment(jsPlayer.player, playerWeaponSet.Gadget);
    }
    return correctWeaponEquipped && isCorrectSlotActive;
}

function createSpawnPoints() {
  let spawnPointId = GAMEMODE_CONFIG.startSpawnPointID;
  do {
    const spawnPoint = mod.GetSpatialObject(spawnPointId); // Even with an invalid ID it returns a SpawnObject so we have to check it by "hand"
    const spawnPointPosition = mod.GetObjectPosition(spawnPoint);
    const spawnPointX = mod.XComponentOf(spawnPointPosition); //Not used for check since for some reason it's not 0 but 1e-7...
    const spawnPointY = mod.YComponentOf(spawnPointPosition);
    const spawnPointZ = mod.ZComponentOf(spawnPointPosition);

    if (spawnPointY === 0 && spawnPointZ === 0) {
      // So far the only way I know to check if something exists
      break;
    }

    spawners.push(mod.CreateVector(spawnPointX, spawnPointY, spawnPointZ));
    mod.MoveObject(spawnPoint, mod.CreateVector(-100, -100, -100)); // Because EnableSpatial and Unspawn don't work...
    spawnPointId++;
  } while (spawnPointId);
}

function getFurthestSpawnPointFromEnemies(
  respawnedPlayer: mod.Player
): mod.Vector {
  const players = mod.AllPlayers();

  let furthestSpawnPoint = spawners[0];
  let furthestSpawnPointDistance = 0;

  for (const spawnPointVector of spawners) {
    let nearestPlayerDistance = 999999999;

    for (let i = 0; i < mod.CountOf(players); i++) {
      const player: mod.Player = mod.ValueInArray(players, i);

      if (
        mod.GetSoldierState(player, mod.SoldierStateBool.IsDead) ||
        mod.Equals(mod.GetTeam(player), mod.GetTeam(respawnedPlayer))
      ) {
        continue;
      }

      const playerVector = mod.GetSoldierState(
        player,
        mod.SoldierStateVector.GetPosition
      );
      const distanceBetween = mod.DistanceBetween(
        spawnPointVector,
        playerVector
      );

      nearestPlayerDistance = Math.min(nearestPlayerDistance, distanceBetween);
    }

    if (furthestSpawnPointDistance < nearestPlayerDistance) {
      furthestSpawnPoint = spawnPointVector;
      furthestSpawnPointDistance = nearestPlayerDistance;
    }
  }

  return furthestSpawnPoint;
}

// -------------------------------
// Settings
// -------------------------------

const GAMEMODE_CONFIG: GameModeConfig = {
    maxLevel: 3,
    GunGameSet: StandardGunGame,
    timeLimit: 10*60 + 15, // 10 minutes
//   score: 75, // 75 kills to win
    freezeTime: 15, // Seconds of freeze time at round start
//   timeLimit: 10 * 60 + 15, // 10 minutes + freeze time
//   progressStageEarly: 20, // How many kills to trigger early progress VO
//   progressStageMid: 40, // How many kills to trigger mid progress VO
//   progressStageLate: 65, // How many kills to trigger late progress VO
    team1ID: 1,
    team2ID: 2,
    // Beginning HQs - place these in Godot where players spawn at match start
    hqRoundStartTeam1: 1,
    hqRoundStartTeam2: 2,
    // In-progress HQs - place these outside the map, surrounded by area trigger
    hqInProgressTeam1: 11,
    hqInProgressTeam2: 12,
    respawnAreaTriggerID: 1000, // AreaTrigger that surrounds the in-progress HQs
//   maxStartingAmmo: true,
    startSpawnPointID: 9001, // Starting ID for spawn point SpatialObjects. Your spawners need to be a SpatialObject (any object that is an actual prop) in incremental IDs starting from startSpawnPointID or they'll not be parsed
};



// -------------------------------
// EVENTS
// -------------------------------

export async function OnPlayerJoinGame(player: mod.Player) {
    // State management for new player
    let jsPlayer = JsPlayer.get(player);
    if (!jsPlayer)
        return;
    mod.DisplayNotificationMessage(mod.Message("Welcome"), player);
    scoreboard?.update(jsPlayer);
}

export function OnPlayerDeployed(eventPlayer: mod.Player): void {
    let jsPlayer = JsPlayer.get(eventPlayer);
    if (!jsPlayer){
        if (debug) {console.log("OnPlayerDeployed: No JSPlayer for ", mod.GetObjId(eventPlayer))};
        return;
    }
    jsPlayer.IsDeployed = true;
    jsPlayer.LastDeployTime = mod.GetMatchTimeElapsed();
    if (debug) console.log("Player ", mod.GetObjId(eventPlayer), " deployed on Level ", jsPlayer.level);
    jsPlayer.applyWeapon();

}

export async function OnPlayerEarnedKill(eventPlayer: mod.Player, eventOtherPlayer: mod.Player, eventDeathType: mod.DeathType, eventWeaponUnlock: mod.WeaponUnlock){
    if (mod.Equals(eventPlayer, eventOtherPlayer))
        return; //Self-Kill
    let jsPlayer = JsPlayer.get(eventPlayer);
    if (!jsPlayer)
        return;
    console.log("Player " + mod.GetObjId(jsPlayer.player) + " earned a kill!");
    jsPlayer.kills++;
    const levelWeaponKill = CheckCorrectPlayerWeaponEquipped(jsPlayer);
    if (levelWeaponKill) {
        console.log("Player " + mod.GetObjId(jsPlayer.player) + " earned a valid kill towards next level! Current kills in level: " + jsPlayer.killsInLevel);
        jsPlayer.addKillForCurrentLevel(); 
    } else {
        let wasMeleeKill = mod.IsInventorySlotActive(jsPlayer.player, mod.InventorySlots.MeleeWeapon);
        if (wasMeleeKill) {
            console.log("Player " + mod.GetObjId(jsPlayer.player) + " earned a melee kill!");
            jsPlayer.addLevel();
            let jsOtherPlayer = JsPlayer.get(eventOtherPlayer);
            if (jsOtherPlayer)
                jsOtherPlayer.demote(); 
        }
    }
    scoreboard?.update(jsPlayer);
}

export async function OnPlayerDied(eventPlayer: mod.Player, eventOtherPlayer: mod.Player, eventDeathType: mod.DeathType, eventWeaponUnlock: mod.WeaponUnlock) {
    let jsPlayer = JsPlayer.get(eventPlayer);
    if (!jsPlayer)
        return;
    jsPlayer.deaths++;
    await mod.Wait(2);
    if (gameEnded){
        return;
    }
    mod.UndeployPlayer(eventPlayer);
}

export function OnPlayerUndeploy(eventPlayer: mod.Player){
    let jsPlayer = JsPlayer.get(eventPlayer);
    if (!jsPlayer)
        return;
    jsPlayer.IsDeployed = false;
    scoreboard?.update(jsPlayer);
}

export function OnPlayerLeaveGame(eventNumber: number){
    // Clean up disconnected players
    for (let i = JsPlayer.jsPlayerInstances.length - 1; i >= 0; i--) {
        const jsp = JsPlayer.jsPlayerInstances[i];
        if (!mod.IsPlayerValid(jsp.player)) {
            JsPlayer.jsPlayerInstances.splice(i, 1);
        }
    }
}

export function OnPlayerEnterAreaTrigger(
  eventPlayer: mod.Player,
  eventAreaTrigger: mod.AreaTrigger
) {
  if (mod.GetObjId(eventAreaTrigger) === GAMEMODE_CONFIG.respawnAreaTriggerID) {
    // The HQ is surrounded by the zone, teleporting any players to the furthest point available
    mod.Teleport(eventPlayer, getFurthestSpawnPointFromEnemies(eventPlayer), 0);
  }
}

export async function OnGameModeStarted() {
    gameEnded = false;
    scoreboard = new Scoreboard();
    scoreboard.initializeOnGameStart();
    mod.SetFriendlyFire(false);
    mod.SetSpawnMode(mod.SpawnModes.Deploy);
    mod.SetGameModeTargetScore(GAMEMODE_CONFIG.maxLevel+1);
    mod.SetGameModeTimeLimit(GAMEMODE_CONFIG.timeLimit); // 10 minutes
    
    // Setup Spawnpoints
    const team1HQ = mod.GetHQ(GAMEMODE_CONFIG.hqRoundStartTeam1);
    const team2HQ = mod.GetHQ(GAMEMODE_CONFIG.hqRoundStartTeam2);
    const team1HQGameStarted = mod.GetHQ(GAMEMODE_CONFIG.hqInProgressTeam1);
    const team2HQGameStarted = mod.GetHQ(GAMEMODE_CONFIG.hqInProgressTeam2);

    mod.EnableHQ(team1HQGameStarted, false);
    mod.EnableHQ(team2HQGameStarted, false);
    createSpawnPoints();
    //await mod.Wait(GAMEMODE_CONFIG.freezeTime);
    gameStarted = true;
    mod.EnableHQ(team1HQ, false);
    mod.EnableHQ(team2HQ, false);
    mod.EnableHQ(team1HQGameStarted, true);
    mod.EnableHQ(team2HQGameStarted, true);
}

