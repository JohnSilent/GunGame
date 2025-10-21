// To be implemented: 
// 1) Randomize weapon list at start of game, depending on numberOfWeapons.
// 2) Kill with melee weapon steals a level from killed enemy and a hole level 
// 3) Add messages for Start, Taken the lead, Knifed, Close to winning, Win
// 4) Automatic Spawn at the Spawnpoint furthest away from enemies 
// 5) Add Scoreboard showing Level, Kills, Deaths 
// 6) Add UI to display current level, weapon and kills needed to level up, next weapon 
// 7) Add sound effects for leveling up and winning




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
        if (debugJSPlayer) {console.log("Adding Player [", mod.GetObjId(this.player), "] Creating JS Player: ", JsPlayer.playerInstances.length)};
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
        return CurrentGunGameSet.WeaponSets[this.level];
    }

    public applyWeapon(){
        const weaponSet = this.GetCurrentWeaponSet();
        if (debugJSPlayer) console.log("applyWeapon: give Weapon ", weaponSet.Weapon?.toString(), "to ", this.playerId);
        if (weaponSet.Weapon) {
            if (weaponSet.WeaponPack)
                mod.AddEquipment(this.player, weaponSet.Weapon, weaponSet.WeaponPack, weaponSet.InventorySlot);
            else
                mod.AddEquipment(this.player, weaponSet.Weapon, weaponSet.InventorySlot);
        } else if (weaponSet.Gadget) {
            mod.AddEquipment(this.player, weaponSet.Gadget, weaponSet.InventorySlot);
        }
        mod.ForceSwitchInventory(this.player, weaponSet.InventorySlot);
        if (debugJSPlayer) console.log("applyWeapon: given Weapon ", weaponSet.Weapon?.toString(), "to ", this.playerId);
    }

    public removeWeapon(){
        const weaponSet = this.GetCurrentWeaponSet();
        if (debugJSPlayer) console.log("removeWeapon: remove ", weaponSet.InventorySlot.toString(), " from ", this.playerId);
        mod.RemoveEquipment(this.player, weaponSet.InventorySlot);
        if (debugJSPlayer) console.log("removeWeapon: removed ", weaponSet.InventorySlot.toString(), " from ", this.playerId);
    }

    private adjustLevel(adjustment: number){
        this.level = this.level + adjustment;
        if (debugJSPlayer) console.log("adjustLevel: Adjusted Level of", this.playerId, "to", this.level);

    }

    public async addLevel(){
        this.removeWeapon();
        this.adjustLevel(1);
        if (debugJSPlayer) console.log("addLevel: Player ", this.playerId, "advanced to level ", this.level);
        if (await this.checkWinCondition()){
            return;
        }
        this.applyWeapon();
        this.killsInLevel = 0;
    }

    public demote(){
        this.removeWeapon();
        this.adjustLevel(-1);
        if (debugJSPlayer) console.log("demote: Player", this.playerId, "demoted to Level", this.level);
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
        if (this.level >= maxLevel) {
            if (debugJSPlayer) console.log("CheckWinCondition: Player ", this.playerId, "won! Ending Game");
            GameEnded = true;
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

// Settings

const VERSION = [0, 2, 1];
const debugJSPlayer = true;
let maxLevel = 2; 
let GameEnded: boolean = false;  
let CurrentGunGameSet: GunGameSet = StandardGunGame;


// -------------------------------
// EVENTS
// -------------------------------
// Triggered when player joins the game. Useful for pregame setup, team management, etc.
export async function OnPlayerJoinGame(player: mod.Player) {
    // State management for new player
    let jsPlayer = JsPlayer.get(player);
    if (!jsPlayer)
        return;
    mod.DisplayNotificationMessage(mod.Message("Welcome"), player);
}

// Triggered when player selects their class and deploys into game. Useful for any spawn/start logic.
export function OnPlayerDeployed(eventPlayer: mod.Player): void {
    let jsPlayer = JsPlayer.get(eventPlayer);
    if (!jsPlayer){
        if (debugJSPlayer) {console.log("OnPlayerDeployed: No JSPlayer for ", mod.GetObjId(eventPlayer))};
        return;
    }
    jsPlayer.IsDeployed = true;
    jsPlayer.LastDeployTime = mod.GetMatchTimeElapsed();
    if (debugJSPlayer) console.log("Player ", mod.GetObjId(eventPlayer), " deployed on Level ", jsPlayer.level);
    jsPlayer.applyWeapon();

}

// Triggered when player earns a kill. Useful for kill tracking, score management, etc.
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
}

export async function OnPlayerDied(eventPlayer: mod.Player, eventOtherPlayer: mod.Player, eventDeathType: mod.DeathType, eventWeaponUnlock: mod.WeaponUnlock) {
    let jsPlayer = JsPlayer.get(eventPlayer);
    if (!jsPlayer)
        return;

    jsPlayer.IsDeployed = false;
    jsPlayer.deaths++;
    await mod.Wait(2);
    if (GameEnded){
        return;
    }
    mod.UndeployPlayer(eventPlayer);
}

export function OnPlayerUndeploy(eventPlayer: mod.Player){
    let jsPlayer = JsPlayer.get(eventPlayer);
    if (!jsPlayer)
        return;
    jsPlayer.IsDeployed = false;
    jsPlayer.deaths++;
}


export async function OnGameModeStarted() {
    mod.SetFriendlyFire(false);
    mod.SetSpawnMode(mod.SpawnModes.Deploy);
    mod.SetGameModeTargetScore(maxLevel+1);
    mod.SetGameModeTimeLimit(10 * 60); // 10 minutes
    CurrentGunGameSet = StandardGunGame;
    GameEnded = false;
}

