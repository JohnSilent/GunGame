// To be implemented: 
// 1) Kill with melee weapon steals a level from killed enemy and a hole level 
// 2) Randomize weapon list at start of game, depending on numberOfWeapons.
// 3) Add messages for Start, Taken the lead, Knifed, Close to winning, Win
// 4) Add UI to display current level and kills needed to level up
// 5) Add sound effects for leveling up and winning


const VERSION = [0, 1, 3];
const debugJSPlayer = true;
let numberOfWeapons = 3; 
let killsPerLevel = 1;



let weaponsListRandom: mod.Weapons[] = [mod.Weapons.Sidearm_P18, mod.Weapons.Carbine_M4A1, mod.Weapons.Carbine_M4A1];  

// Add random melee weapon for last level 
const Melee_Weapons: mod.Gadgets[] = [
        mod.Gadgets.Melee_Combat_Knife,
        mod.Gadgets.Melee_Hunting_Knife,
        mod.Gadgets.Melee_Sledgehammer,];


class JsPlayer {
    player: mod.Player;
    playerId: number;
    // score:
    killsInLevel: number = 0;
    level: number = 0; 

    // static array to hold all player instances
    static playerInstances: mod.Player[] = [];

    // declare dictionary with int keys
    static #allJsPlayers: { [key: number] : JsPlayer }  = {};

    constructor(player: mod.Player) {
        this.player = player;
        this.playerId = mod.GetObjId(player);
        JsPlayer.playerInstances.push(this.player);
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

    giveWeapon() {
        // give player new weapon based on level in JsPlayer
        const newWeapon = weaponsListRandom[this.level];
        if (this.level >= 1) {
            mod.RemoveEquipment(this.player, weaponsListRandom[this.level - 1]);
        }
        
        else { 
            // check and remove any weapon from starting loadout
            if (mod.HasEquipment(this.player, weaponsListRandom[0])) 
                {
                mod.RemoveEquipment(this.player, weaponsListRandom[0]);
                }
        }
        mod.AddEquipment(this.player, newWeapon);
        if (debugJSPlayer) console.log("Assigned Weapon: ", newWeapon, " to Player: ", mod.GetObjId(this.player), " for Level: ", this.level); 
    }
}


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
    if (debugJSPlayer) console.log("Player ", mod.GetObjId(eventPlayer), " deployed on Level ", jsPlayer.level);
    
    // Assign weapon based on player level
    jsPlayer.giveWeapon();
    mod.DisplayNotificationMessage(mod.Message('You are on Level ${jsPlayer.level}. Get kills to advance!'),eventPlayer);

}


// Triggered when player earns a kill. Useful for kill tracking, score management, etc.
export function OnPlayerEarnedKill(
    eventPlayer: mod.Player,
    eventOtherPlayer: mod.Player,
    eventDeathType: mod.DeathType,
    eventWeaponUnlock: mod.WeaponUnlock
): void {
    let jsPlayer = JsPlayer.get(eventPlayer);
    if (!jsPlayer){
        if (debugJSPlayer) {console.log("OnPlayerEarnedKill: No JSPlayer for ", mod.GetObjId(eventPlayer))};
        return;
    }
    jsPlayer.killsInLevel +=1; 
    if (debugJSPlayer) console.log("JsPlayer", jsPlayer.playerId, " Earned Kill. Kills in Level: ", jsPlayer?.killsInLevel);
    // Check if player has enough kills to level up and assign new weapon
    if (jsPlayer.killsInLevel >= killsPerLevel) {
        jsPlayer.level += 1;
        jsPlayer.killsInLevel = 0; // Reset kills for next level
        mod.SetGameModeScore(eventPlayer, jsPlayer.level);
        if (debugJSPlayer) console.log("JsPlayer", jsPlayer.playerId, " Leveled Up! New Level: ", jsPlayer.level);

        // Check for win condition
        if (jsPlayer.level > numberOfWeapons) {
            mod.EndGameMode(eventPlayer); 
            return;
        }
        jsPlayer.giveWeapon();
    }

}

export async function OnGameModeStarted() {
    mod.SetSpawnMode(mod.SpawnModes.AutoSpawn)
    mod.SetGameModeTargetScore(numberOfWeapons+1);
    mod.SetFriendlyFire(false);

}


// Code Snippets for future implementation:

// Check if this is a human player or not. 
// if (mod.GetSoldierState(player, mod.SoldierStateBool.IsAISoldier) == false)


// Randomize weapons list at start of game

// const weaponNames = Object.values(Weapons)
//   .filter((v): v is keyof typeof Weapons => typeof v === 'string');

// const randomWeapon = weaponNames[Math.floor(Math.random() * weaponNames.length)]

// function UpdateScoreUI(player: mod.Player) {
//     let jsPlayer = JsPlayer.get(player);
//     if (jsPlayer)
//         jsPlayer.scoreUI?.refresh();
// }



// const allWeapons = mod.EmptyArray()
// for (const element of Object.keys(mod.Weapons)) {
//     mod.AppendToArray(allWeapons, element)
// };    

// export async function OnPlayerDeployed(eventPlayer: mod.Player): Promise<void> {
//     const randomWeapon = mod.RandomValueInArray(allWeapons);
// }