. "$PSScriptRoot\Common.ps1"
$game="$base\server\game\csgo"
$css="$game\addons\counterstrikesharp"
$secret=Get-Content -Encoding UTF8 -LiteralPath "$base\data\secrets.json" -Raw|ConvertFrom-Json
$gi="$game\gameinfo.gi"
$text=[IO.File]::ReadAllText($gi)
if($text -notmatch 'Game\s+csgo/addons/metamod'){
    if($text -notmatch 'Game_LowViolence\s+csgo_lv'){throw 'gameinfo.gi changed upstream; expected insertion point not found.'}
    if(!(Test-Path -LiteralPath "$base\backups\server-gameinfo-original.gi")){Copy-Item -LiteralPath $gi -Destination "$base\backups\server-gameinfo-original.gi"}
    $text=$text -replace '(Game_LowViolence\s+csgo_lv)',"`$1`r`n`t`t`tGame`tcsgo/addons/metamod"
    [IO.File]::WriteAllText($gi,$text,[Text.UTF8Encoding]::new($false))
}
@{FollowCS2ServerGuidelines=$false;ServerLanguage='zh-cn';PluginHotReloadEnabled=$false}|ConvertTo-Json|Set-Content -LiteralPath "$css\configs\core.json" -Encoding utf8
New-Item -ItemType Directory -Path "$css\configs\plugins\WeaponPaints" -Force|Out-Null
@{ConfigVersion=10;SkinsLanguage='zh-CN';DatabaseHost='127.0.0.1';DatabasePort=3307;DatabaseUser='inspect';DatabasePassword=$secret.database.password;DatabaseName='cs2inspect';CmdRefreshCooldownSeconds=1;Website='http://127.0.0.1:17830';MenuType='selectable';Additional=@{KnifeEnabled=$true;GloveEnabled=$true;SkinEnabled=$true;AgentEnabled=$true;MusicEnabled=$false;PinsEnabled=$false;CommandWpEnabled=$true;ShowSkinImage=$false}}|ConvertTo-Json -Depth 4|Set-Content -LiteralPath "$css\configs\plugins\WeaponPaints\WeaponPaints.json" -Encoding utf8
$cfg=@"
hostname "Local CS2 Inspect"
sv_lan 1
sv_filterban 0
addip 0 127.0.0.1
net_p2p_listen_dedicated 0
rcon_password "$($secret.rconPassword)"
sv_cheats 1
bot_quota 0
bot_kick
mp_limitteams 0
mp_autoteambalance 0
mp_freezetime 0
mp_warmup_online_enabled 0
mp_warmup_offline_enabled 0
mp_warmup_pausetimer 0
sv_warmup_to_freezetime_delay 0
mp_warmuptime 0
mp_warmup_end
mp_roundtime 60
mp_roundtime_defuse 60
mp_maxrounds 999
mp_ignore_round_win_conditions 1
mp_buytime 99999
mp_buy_anywhere 1
mp_maxmoney 65535
mp_startmoney 65535
mp_afterroundmoney 65535
mp_respawn_on_death_t 1
mp_respawn_on_death_ct 1
mp_death_drop_gun 0
mp_death_drop_grenade 0
mp_ct_default_primary weapon_ak47
mp_t_default_primary weapon_ak47
sv_infinite_ammo 2
sv_hibernate_when_empty 0
log on
"@
[IO.File]::WriteAllText("$game\cfg\inspect_server.cfg",$cfg,[Text.UTF8Encoding]::new($false))
foreach($f in @('server.cfg','gamemode_casual_server.cfg')){[IO.File]::WriteAllText("$game\cfg\$f",'exec inspect_server.cfg',[Text.UTF8Encoding]::new($false))}
Write-Output 'Configured the independent server copy.'
