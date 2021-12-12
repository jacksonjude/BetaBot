import { CronJob } from "cron"

const statChannelsCollectionID = "statsConfigurations"

var statsData = {}
var onlineMemberCountCronJob
var messageCountsCronJobs = {}

export const interpretStatsSetting = async function(client, guildID, statsDataJSON, firestoreDB)
{
  statsData[guildID] = statsDataJSON

  client.guilds.fetch(guildID).then(guild => {
    updateTotalMembersStat(guild)
    updateOnlineMembersStat(guild)
    updateBoostMembersStat(guild)
  }).catch(console.error)

  if (statsData[guildID].messageCounts)
  {
    let messageCountsData = statsData[guildID].messageCounts
    setupMessageCountsCronJob(client, guildID, messageCountsData, firestoreDB)
  }
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

  onlineMemberCountCronJob = new CronJob("0 */10 * * * *", () => {
    Object.keys(statsData).forEach((guildID) => {
      client.guilds.fetch(guildID).then(guild => {
        updateOnlineMembersStat(guild)
      })
    })
  })
  onlineMemberCountCronJob.start()

  client.on('guildMemberUpdate', async (oldMember, _) => {
    // Update boost stat
    if (oldMember == null || oldMember.guild == null) { return }
    updateBoostMembersStat(oldMember.guild)
  })
}

function setupMessageCountsCronJob(client, guildID, messageCountsData, firestoreDB)
{
  let messageCountCronJob = new CronJob("1 0 " + (messageCountsData.cronHours ?? "0") + " * * *", () => {
    client.guilds.fetch(guildID).then(async guild => {
      updateMessageCounts(guild, messageCountsData.hours, messageCountsData.startTime.toMillis(), firestoreDB)
    })
  }, null, true, messageCountsData.timeZone ?? "America/Los_Angeles")
  messageCountCronJob.start()

  if (messageCountsCronJobs[guildID])
  {
    messageCountsCronJobs[guildID].stop()
  }

  messageCountsCronJobs[guildID] = messageCountCronJob
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

async function updateMessageCounts(guild, hoursPerSegment, trackingStartTime, firestoreDB)
{
  let messageCountsCollectionPath = statChannelsCollectionID + "/" + guild.id + "/" + "messageCounts"
  let previousMessageCounts = await firestoreDB.collection(messageCountsCollectionPath).get()

  let previouslyCalculatedSegments = []
  previousMessageCounts.forEach((messageCountsDoc) => {
    previouslyCalculatedSegments.push(messageCountsDoc.id)
  })

  var updatedMessageCountSegments = {}

  var guildChannels = await guild.channels.fetch()
  for (let channel of guildChannels.values())
  {
    if (channel.type != "GUILD_TEXT") { continue }
    let channelMessages
    try
    {
      channelMessages = await channel.messages.fetch({limit: 100})
    }
    catch (error)
    {
      continue
    }

    const processMessages = async function(messages)
    {
      for (let message of messages)
      {
        let messageCreatedTimestamp = message.createdAt.getTime()
        if (messageCreatedTimestamp < trackingStartTime) { return true }
        if (message.author.bot) { continue }

        let segmentStartTime = messageCreatedTimestamp-((messageCreatedTimestamp-trackingStartTime)%(hoursPerSegment*60*60*1000))
        if (previouslyCalculatedSegments.includes(segmentStartTime.toString()))
        {
          return true
        }

        if (!updatedMessageCountSegments[segmentStartTime])
        {
          updatedMessageCountSegments[segmentStartTime] = {}
        }
        if (!updatedMessageCountSegments[segmentStartTime][message.author.id])
        {
          updatedMessageCountSegments[segmentStartTime][message.author.id] = 0
        }

        updatedMessageCountSegments[segmentStartTime][message.author.id] += 1
      }

      return false
    }

    let shouldBreakMessageLoop = false
    // let fetchedMessageCount = channelMessages.size
    while (channelMessages.size > 0 && !shouldBreakMessageLoop)
    {
      // console.log("Message Counts: " + channel.id + " (count = " + fetchedMessageCount + ", time = " + channelMessages.last().createdAt.getTime() + ")")
      shouldBreakMessageLoop = await processMessages(channelMessages.values())

      if (channelMessages.size > 0 && channelMessages.last().id)
      {
        try
        {
          channelMessages = await channel.messages.fetch({before: channelMessages.last().id, limit: 100})
          // fetchedMessageCount += channelMessages.size
        }
        catch
        {
          shouldBreakMessageLoop = true
        }
      }
    }
  }

  for (let messageCountSegmentTime in updatedMessageCountSegments)
  {
    console.log("Message Counts: Add segment " + messageCountSegmentTime + " (" + new Date(parseInt(messageCountSegmentTime)) + ") in " + guild.name)
    await firestoreDB.doc(messageCountsCollectionPath + "/" + messageCountSegmentTime).set(updatedMessageCountSegments[messageCountSegmentTime])
  }
}
