using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using CounterStrikeSharp.API;
using CounterStrikeSharp.API.Core;
using CounterStrikeSharp.API.Core.Attributes;
using CounterStrikeSharp.API.Modules.Commands;
using CounterStrikeSharp.API.Modules.Timers;

[MinimumApiVersion(380)]
public sealed class LocalInspectBridge : BasePlugin
{
    public override string ModuleName => "LocalInspectBridge";
    public override string ModuleVersion => "1.1.0";
    public override string ModuleAuthor => "Local CS2 Inspect";
    public override string ModuleDescription => "Apply one local item after loading its data; preserve other equipment.";
    private const BindingFlags All = BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Static | BindingFlags.Instance;
    private readonly Dictionary<string, Job> jobs = new();
    private readonly Dictionary<ulong, string> pending = new();
    private volatile bool loaded;
    private ulong allowedSteam;
    private static readonly HashSet<int> Pistols = new() { 1, 2, 3, 4, 30, 32, 36, 61, 63, 64 };
    private static readonly HashSet<int> Primaries = new() { 7, 8, 9, 10, 11, 13, 14, 16, 17, 19, 23, 24, 25, 26, 27, 28, 29, 33, 34, 35, 38, 39, 40, 60 };
    private static readonly HashSet<int> Gloves = new() { 4725, 5027, 5030, 5031, 5032, 5033, 5034, 5035 };

    private sealed class Job
    {
        public string id { get; set; } = "";
        public string status { get; set; } = "pending";
        public string error { get; set; } = "";
        public string focus { get; set; } = "";
        public string kind { get; set; } = "";
        public int requestedDef { get; set; }
        public int previousDef { get; set; }
        public int activeDef { get; set; }
        public int appliedDef { get; set; }
        public int paint { get; set; }
        public int seed { get; set; }
        public ulong Steam;
        public nint Pawn;
        public string PreviousSlot = "";
        public string PreviousName = "";
        public string TargetSlot = "";
        public string TargetName = "";
        public DateTime Created = DateTime.UtcNow;
    }

    public override void Load(bool hotReload)
    {
        using var profile = JsonDocument.Parse(System.IO.File.ReadAllText(System.IO.Path.GetFullPath(System.IO.Path.Combine(ModuleDirectory, "../../../../../../../data/profile.json"))).TrimStart('\uFEFF'));
        allowedSteam = ulong.Parse(profile.RootElement.GetProperty("steamId").GetString()!);
        loaded = true;
        AddCommand("inspect_apply", "Local console: apply one selected item", ApplyCommand);
        AddCommand("inspect_result", "Local console: query apply result", (caller, command) => {
            if (caller != null) return;
            command.ReplyToCommand(jobs.TryGetValue(command.GetArg(1), out var job) ? JsonSerializer.Serialize(job) : "{\"status\":\"missing\"}");
        });
        AddCommand("inspect_inventory", "Local console: inspect current equipment", InventoryCommand);
        AddCommand("inspect_plan", "Local console: preview an item replacement without changing equipment", (caller, command) => {
            if (caller != null) return;
            try {
                var wp = Integration();var player = Find(allowedSteam);
                if (!Alive(player)) throw new InvalidOperationException("Player must be alive");
                _ = PlayerInfo(wp, player!);
                var kind = command.GetArg(1);var def = int.Parse(command.GetArg(2));
                var slot = kind == "glove" ? "" : Slot(def);
                var all = player!.PlayerPawn.Value!.WeaponServices!.MyWeapons.Select(h => h.Value).Where(w => w is { IsValid: true }).Select(w => Definition(w)).ToArray();
                command.ReplyToCommand(JsonSerializer.Serialize(new { requestedDef = def, target = kind == "glove" ? "gloves" : IsKnife(def) ? "weapon_knife" : wp.Map[def],
                    replace = all.Where(d => slot != "" && Slot(d) == slot).ToArray(), keep = all.Where(d => slot == "" || Slot(d) != slot).ToArray(), focus = kind == "glove" ? "preserve" : slot }));
            } catch (Exception e) { command.ReplyToCommand("INSPECT_ERROR " + RootMessage(e)); }
        });
        AddCommand("inspect_ready", "Local console: verify plugin integration", (caller, command) => {
            if (caller != null) return;
            try { var wp = Integration(); command.ReplyToCommand("INSPECT_READY " + wp.Map.Count); }
            catch (Exception e) { command.ReplyToCommand("INSPECT_ERROR " + RootMessage(e)); }
        });
    }

    public override void Unload(bool hotReload) { loaded = false; pending.Clear(); }
    private static int Definition(CBasePlayerWeapon? weapon) => weapon is { IsValid: true } ? weapon.AttributeManager.Item.ItemDefinitionIndex : 0;
    private static bool IsKnife(int def) => def == 42 || def == 59 || (def >= 500 && def <= 526);
    private static string Slot(int def) => IsKnife(def) ? "slot3" : def == 31 ? "slot11" : Pistols.Contains(def) ? "slot2" : Primaries.Contains(def) ? "slot1" : def == 49 ? "slot5" : def == 44 ? "slot6" : def == 43 ? "slot7" : def == 45 ? "slot8" : def == 47 ? "slot9" : def == 46 || def == 48 ? "slot10" : "";
    private static string RootMessage(Exception e) => (e is TargetInvocationException { InnerException: not null } invocation ? invocation.InnerException : e)!.Message;
    private static CCSPlayerController? Find(ulong steam) => Utilities.GetPlayers().FirstOrDefault(p => p.IsValid && !p.IsBot && p.SteamID == steam);
    private static bool Alive(CCSPlayerController? player) => player is { IsValid: true, PawnIsAlive: true } && player.PlayerPawn.Value is { IsValid: true, WeaponServices: not null };

    private sealed class WP
    {
        public object Instance = null!;
        public object Sync = null!;
        public Type Type = null!;
        public MethodInfo ReadData = null!;
        public Type Info = null!;
        public IDictionary<int, string> Map = null!;
    }

    private static WP Integration()
    {
        var type = AppDomain.CurrentDomain.GetAssemblies().Select(a => a.GetType("WeaponPaints.WeaponPaints", false)).LastOrDefault(t => t != null)
            ?? throw new InvalidOperationException("WeaponPaints is not loaded");
        var wp = new WP { Type = type };
        wp.Instance = type.GetProperty("Instance", All)!.GetValue(null)!;
        wp.Sync = type.GetField("WeaponSync", All)!.GetValue(null) ?? throw new InvalidOperationException("WeaponPaints database cache is not ready");
        wp.ReadData = wp.Sync.GetType().GetMethod("GetPlayerData", All)!;
        wp.Info = wp.ReadData.GetParameters()[0].ParameterType;
        wp.Map = (IDictionary<int, string>)type.GetProperty("WeaponDefindex", All)!.GetValue(null)!;
        if (wp.ReadData == null || wp.Instance == null) throw new InvalidOperationException("WeaponPaints API is incompatible");
        return wp;
    }

    private static object PlayerInfo(WP wp, CCSPlayerController player)
    {
        var info = Activator.CreateInstance(wp.Info)!;
        var values = new Dictionary<string, object?> {
            ["UserId"] = player.UserId, ["Slot"] = player.Slot, ["Index"] = (int)player.Index,
            ["SteamId"] = player.SteamID.ToString(), ["Name"] = player.PlayerName,
            ["IpAddress"] = player.IpAddress?.Split(':')[0]
        };
        foreach (var pair in values) wp.Info.GetProperty(pair.Key, All)!.SetValue(info, pair.Value);
        return info;
    }

    private void ApplyCommand(CCSPlayerController? caller, CommandInfo command)
    {
        if (caller != null) return;
        var id = command.GetArg(1);
        if (!Regex.IsMatch(id, "^[a-f0-9]{24}$") || !ulong.TryParse(command.GetArg(2), out var steam) || steam != allowedSteam || !int.TryParse(command.GetArg(4), out var def)) {
            command.ReplyToCommand("INSPECT_ERROR invalid request"); return;
        }
        if (jobs.ContainsKey(id)) { command.ReplyToCommand("INSPECT_ACCEPTED " + id); return; }
        if (pending.ContainsKey(steam)) { command.ReplyToCommand("INSPECT_ERROR player request is busy"); return; }
        var kind = command.GetArg(3);
        var player = Find(steam);
        if (!Alive(player)) { command.ReplyToCommand("INSPECT_ERROR choose a team and spawn first"); return; }
        try {
            var wp = Integration();
            var active = player!.PlayerPawn.Value!.WeaponServices!.ActiveWeapon.Value;
            var previousDef = Definition(active);
            if (kind == "current") { def = previousDef; kind = IsKnife(def) ? "knife" : "weapon"; }
            if (kind != "agent" && (kind == "glove" ? !Gloves.Contains(def) : (!wp.Map.ContainsKey(def) && def != 42 && def != 59) || (kind == "knife" ? !IsKnife(def) : kind != "weapon" || IsKnife(def)))) {
                command.ReplyToCommand("INSPECT_ERROR invalid item"); return;
            }
            foreach (var old in jobs.Values.Where(j => j.status != "pending" && (DateTime.UtcNow - j.Created).TotalMinutes > 5).ToArray()) jobs.Remove(old.id);
            var job = new Job { id = id, Steam = steam, Pawn = player.PlayerPawn.Value!.Handle, kind = kind, requestedDef = def,
                previousDef = previousDef, PreviousSlot = Slot(previousDef), PreviousName = active?.DesignerName ?? "",
                TargetSlot = kind == "glove" ? Slot(previousDef) : Slot(def), TargetName = kind == "agent" || kind == "glove" ? "" : kind == "knife" ? "weapon_knife" : wp.Map[def] };
            jobs[id] = job; pending[steam] = id;
            var info = PlayerInfo(wp, player);
            command.ReplyToCommand("INSPECT_ACCEPTED " + id);
            AddTimer(12f, () => { if (job.status == "pending") Fail(job, "Timed out while applying item"); }, TimerFlags.STOP_ON_MAPCHANGE);
            _ = Task.Run(async () => {
                try {
                    // Complete the SQL read before any entity is replaced. Never send a second refresh.
                    await ((Task)wp.ReadData.Invoke(wp.Sync, new[] { info })!);
                    if (loaded) Server.NextFrame(() => ApplyLoaded(job, wp));
                } catch (Exception e) { if (loaded) Server.NextFrame(() => Fail(job, RootMessage(e))); }
            });
        } catch (Exception e) { command.ReplyToCommand("INSPECT_ERROR " + RootMessage(e)); }
    }

    private CCSPlayerController? Current(Job job)
    {
        if (!loaded || job.status != "pending") return null;
        var player = Find(job.Steam);
        if (!Alive(player) || player!.PlayerPawn.Value!.Handle != job.Pawn) { Fail(job, "Player respawned or disconnected; apply again"); return null; }
        return player;
    }

    private void ApplyLoaded(Job job, WP wp)
    {
        var player = Current(job); if (player == null) return;
        try {
            if (job.kind == "agent") {
                wp.Type.GetMethod("GivePlayerAgent", All)!.Invoke(null, new object[] { player });
                job.appliedDef = job.requestedDef;
                job.activeDef = Definition(player.PlayerPawn.Value!.WeaponServices!.ActiveWeapon.Value);
                job.focus = "preserved";
                job.status = "done"; pending.Remove(job.Steam);
                return;
            }
            if (job.kind == "glove") {
                wp.Type.GetMethod("GivePlayerGloves", All)!.Invoke(wp.Instance, new object[] { player });
                job.appliedDef = job.requestedDef;
                AddTimer(0.35f, () => Focus(job), TimerFlags.STOP_ON_MAPCHANGE);
                return;
            }
            // Replace only the selected equipment slot; keep the player's other weapons untouched.
            var weapons = player.PlayerPawn.Value!.WeaponServices!.MyWeapons.Select(h => h.Value).Where(w => w is { IsValid: true }).ToArray();
            foreach (var weapon in weapons) {
                if (Slot(Definition(weapon)) == job.TargetSlot) weapon!.AddEntityIOEvent("Kill", weapon, null, "", 0.1f);
            }
            AddTimer(0.2f, () => GiveSelected(job), TimerFlags.STOP_ON_MAPCHANGE);
        } catch (Exception e) { Fail(job, RootMessage(e)); }
    }

    private void GiveSelected(Job job)
    {
        var player = Current(job); if (player == null) return;
        try {
            var pointer = player.GiveNamedItem(job.TargetName);
            if (pointer == nint.Zero) throw new InvalidOperationException("Could not create selected weapon");
            var weapon = new CBasePlayerWeapon(pointer);
            job.appliedDef = Definition(weapon);
            if (job.kind == "knife" && (job.requestedDef == 42 || job.requestedDef == 59) && IsKnife(job.appliedDef)) job.requestedDef = job.appliedDef;
            job.paint = weapon.FallbackPaintKit; job.seed = weapon.FallbackSeed;
            AddTimer(0.18f, () => Focus(job), TimerFlags.STOP_ON_MAPCHANGE);
        } catch (Exception e) {
            if (!string.IsNullOrEmpty(job.PreviousName) && job.PreviousSlot == job.TargetSlot) {
                try { player.GiveNamedItem(job.PreviousName); } catch { }
            }
            if (!string.IsNullOrEmpty(job.PreviousSlot)) player.ExecuteClientCommand(job.PreviousSlot);
            Fail(job, RootMessage(e));
        }
    }

    private void Focus(Job job)
    {
        var player = Current(job); if (player == null) return;
        try {
            if (!string.IsNullOrEmpty(job.TargetSlot)) player.ExecuteClientCommand(job.TargetSlot);
            AddTimer(0.2f, () => Finish(job, false), TimerFlags.STOP_ON_MAPCHANGE);
        } catch (Exception e) { Fail(job, RootMessage(e)); }
    }

    private void Finish(Job job, bool fallback)
    {
        var player = Current(job); if (player == null) return;
        try {
            var active = player.PlayerPawn.Value!.WeaponServices!.ActiveWeapon.Value;
            job.activeDef = Definition(active);
            var expected = job.kind == "glove" ? job.previousDef : job.requestedDef;
            if (job.activeDef != expected && !fallback && !string.IsNullOrEmpty(job.PreviousSlot)) {
                player.ExecuteClientCommand(job.PreviousSlot);
                AddTimer(0.2f, () => Finish(job, true), TimerFlags.STOP_ON_MAPCHANGE);return;
            }
            job.focus = job.activeDef == expected ? (job.kind == "glove" ? "preserved" : "selected") : job.activeDef == job.previousDef ? "preserved" : "unconfirmed";
            var actual = job.kind == "glove" ? null : player.PlayerPawn.Value!.WeaponServices!.MyWeapons.Select(h => h.Value).FirstOrDefault(w => w is { IsValid: true } && Definition(w) == job.requestedDef);
            if (actual != null) { job.appliedDef = Definition(actual);job.paint = actual.FallbackPaintKit;job.seed = actual.FallbackSeed; }
            if (job.appliedDef != job.requestedDef) { Fail(job, "Selected weapon model was not confirmed");return; }
            job.status = "done"; pending.Remove(job.Steam);
            Server.PrintToConsole($"[LocalInspect] applied once: def={job.requestedDef}, active={job.activeDef}, focus={job.focus}");
        } catch (Exception e) { Fail(job, RootMessage(e)); }
    }

    private void Fail(Job job, string message)
    {
        if (job.status != "pending") return;
        job.status = "error";job.error = message;pending.Remove(job.Steam);
        Server.PrintToConsole("[LocalInspect] apply failed: " + message);
    }

    private void InventoryCommand(CCSPlayerController? caller, CommandInfo command)
    {
        if (caller != null) return;
        var player = Find(allowedSteam);
        if (!Alive(player)) { command.ReplyToCommand("{\"alive\":false}");return; }
        var weapons = player!.PlayerPawn.Value!.WeaponServices!;
        command.ReplyToCommand(JsonSerializer.Serialize(new { alive = true, activeDef = Definition(weapons.ActiveWeapon.Value),
            weapons = weapons.MyWeapons.Select(h => h.Value).Where(w => w is { IsValid: true }).Select(w => new { def = Definition(w), name = w!.DesignerName, paint = w.FallbackPaintKit, seed = w.FallbackSeed }).ToArray() }));
    }
}
