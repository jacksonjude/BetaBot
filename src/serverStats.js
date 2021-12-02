// Member Stats

var statsData = {}

export const interpretStatsSetting = async function(client, guildID, statsDataJSON)
{
  statsData[guildID] = statsDataJSON

  client.guilds.fetch(guildID).then(guild => {
    updateTotalMembersStat(guild)
    updateOnlineMembersStat(guild)
    updateBoostMembersStat(guild)
  }).catch(console.error)
}

export const setupMemberStatsEventHandlers = function(client)
{
  client.on('guildMemberAdd', (member) => {
    // Update members stat
    if (member == null || member.guild == null) { return }
    updateTotalMembersStat(member.guild)
  })

  client.on('guildMemberRemove', (member) => {
    // Update members stat
    if (member == null || member.guild == null) { return }
    updateTotalMembersStat(member.guild)
  })

  client.on('presenceUpdate', (member) => {
    // Update online stat
    if (member == null || member.guild == null) { return }
    updateOnlineMembersStat(member.guild) // Not using this for updates
  })

  client.on('guildMemberUpdate', async (oldMember, _) => {
    // Update boost stat
    if (oldMember == null || oldMember.guild == null) { return }
    updateBoostMembersStat(oldMember.guild)
  })
}

function updateTotalMembersStat(guild)
{
  var guildStatsSettings = statsData[guild.id]
  if (guildStatsSettings == null || guildStatsSettings.totalCountChannelID == null) { return }

  var totalCount = guild.memberCount

  updateStatChannelName(guild, guildStatsSettings.totalCountChannelID, totalCount)
}

async function updateOnlineMembersStat(guild)
{
  var guildStatsSettings = statsData[guild.id]
  if (guildStatsSettings == null || guildStatsSettings.onlineCountChannelID == null) { return }

  if (guildStatsSettings.lastOnlineCountFetch != null && Date.now()-guildStatsSettings.lastOnlineCountFetch < 1000*60*10)
  {
    return
  }
  guildStatsSettings.lastOnlineCountFetch = Date.now()

  var guildMembers = await guild.members.fetch()
  var onlineCount = guildMembers.filter(m => m.presence != null && m.presence.status != "offline").size

  updateStatChannelName(guild, guildStatsSettings.onlineCountChannelID, onlineCount)
}

function updateBoostMembersStat(guild)
{
  var guildStatsSettings = statsData[guild.id]
  if (guildStatsSettings == null || guildStatsSettings.boostCountChannelID == null) { return }

  var boostCount = guild.premiumSubscriptionCount

  updateStatChannelName(guild, guildStatsSettings.boostCountChannelID, boostCount)
}

async function updateStatChannelName(guild, channelID, statValue)
{
  let channelToUpdate = await guild.channels.fetch(channelID)
  if (channelToUpdate == null) { return }

  let currentChannelName = channelToUpdate.name
  let newChannelName = currentChannelName.replace(/\d+/, statValue)
  await channelToUpdate.setName(newChannelName)
}
