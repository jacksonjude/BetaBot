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

Date.prototype.stdTimezoneOffset = function() {
  var jan = new Date(this.getFullYear(), 0, 1)
  var jul = new Date(this.getFullYear(), 6, 1)
  return Math.max(jan.getTimezoneOffset(), jul.getTimezoneOffset())
}

Date.prototype.dstTimezoneOffset = function() {
  var jan = new Date(this.getFullYear(), 0, 1)
  var jul = new Date(this.getFullYear(), 6, 1)
  return Math.min(jan.getTimezoneOffset(), jul.getTimezoneOffset())
}

Date.prototype.isDSTObserved = function() {
  return this.getTimezoneOffset() < this.stdTimezoneOffset()
}

Date.prototype.getOffsetDueToDST = function() {
  return 1000*60*(this.isDSTObserved() ? this.stdTimezoneOffset()-this.getTimezoneOffset() : this.dstTimezoneOffset()-this.getTimezoneOffset())
}

async function updateMessageCounts(guild, hoursPerSegment, trackingStartTime, firestoreDB, verbose)
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
        if ((new Date(segmentStartTime)).isDSTObserved() != (new Date(trackingStartTime)).isDSTObserved())
        {
          segmentStartTime -= new Date(segmentStartTime).getOffsetDueToDST()
        }
        if (segmentStartTime+hoursPerSegment*60*60*1000 > Date.now())
        {
          continue
        }
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
    let fetchedMessageCount = channelMessages.size
    while (channelMessages.size > 0 && !shouldBreakMessageLoop)
    {
      if (verbose)
      {
        console.log("Message Counts: " + channel.id + " (count = " + fetchedMessageCount + ", time = " + channelMessages.last().createdAt.getTime() + ")")
      }
      shouldBreakMessageLoop = await processMessages(channelMessages.values())

      if (channelMessages.size > 0 && channelMessages.last().id)
      {
        try
        {
          channelMessages = await channel.messages.fetch({before: channelMessages.last().id, limit: 100})
          fetchedMessageCount += channelMessages.size
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

export const sendMessageCountsUpdateCommand = async function(msg, messageContent, firestoreDB)
{
  const updateMessageCountsRegex = /^updateleaderboard$/

  if (updateMessageCountsRegex.test(messageContent) && statsData[msg.guildId] && statsData[msg.guildId].messageCounts)
  {
    let guild = await msg.guild.fetch()
    let messageCountsData = statsData[msg.guildId].messageCounts

    updateMessageCounts(guild, messageCountsData.hours, messageCountsData.startTime.toMillis(), firestoreDB, true)

    return true
  }

  return false
}

export const sendMessageCountsLeaderboardCommand = async function(client, msg, messageContent, firestoreDB)
{
  const leaderboardCommandRegex = /^leaderboard(\s+(\w+))?(\s+([\d\/]+)\s+([\d\/]+))?$/

  if (leaderboardCommandRegex.test(messageContent.toLowerCase()) && statsData[msg.guildId] && statsData[msg.guildId].messageCounts)
  {
    let messageCountsData = statsData[msg.guildId].messageCounts

    let commandGroups = leaderboardCommandRegex.exec(messageContent)
    let leaderboardToShow = commandGroups[2]

    let messageCountsCollection = await firestoreDB.collection(statChannelsCollectionID + "/" + msg.guildId + "/" + "messageCounts").get()

    let currentTime = Date.now()

    let isAllTime = false
    let segmentSumType
    let segmentSumTimeRange = {start: messageCountsData.startTime, end: currentTime, startString: null, endString: null}

    if (messageCountsData.segmentSums)
    {
      segmentSumType = statsData[msg.guildId].messageCounts.segmentSums.find((segmentSumType) => segmentSumType.key == leaderboardToShow)

      if (segmentSumType)
      {
        segmentSumTimeRange.start = currentTime-((currentTime-messageCountsData.startTime.toMillis())%(messageCountsData.hours*60*60*1000))-(segmentSumType.count*messageCountsData.hours*60*60*1000)
        segmentSumTimeRange.end = currentTime
      }
    }

    if (!segmentSumType && commandGroups[4] && commandGroups[5])
    {
      segmentSumTimeRange.startString = commandGroups[4]
      segmentSumTimeRange.endString = commandGroups[5]

      let startDateParts = segmentSumTimeRange.startString.split("/")
      let endDateParts = segmentSumTimeRange.endString.split("/")

      if (startDateParts.length != 3 || endDateParts.length != 3) { return false }

      let startDate = new Date(parseInt(startDateParts[2]), parseInt(startDateParts[0])-1, parseInt(startDateParts[1]))
      let endDate = new Date(parseInt(endDateParts[2]), parseInt(endDateParts[0])-1, parseInt(endDateParts[1]))

      console.log(startDate, endDate)

      if (startDate.getTime() == NaN || endDate.getTime() == NaN) { return false }

      segmentSumTimeRange.start = startDate.getTime()
      segmentSumTimeRange.end = endDate.getTime()

      console.log(startDate.getTime(), endDate.getTime())
    }
    else if (!segmentSumType)
    {
      isAllTime = true
    }

    let sortedMessageCountsDocs = messageCountsCollection.docs.sort((doc1, doc2) => parseInt(doc2.id)-parseInt(doc1.id))

    let summedMessageCounts = {}
    for (let docSnapshot of sortedMessageCountsDocs)
    {
      if (parseInt(docSnapshot.id) < segmentSumTimeRange.start || parseInt(docSnapshot.id) > segmentSumTimeRange.end) { continue }

      let messageCountsSegment = docSnapshot.data()
      for (let userID of Object.keys(messageCountsSegment))
      {
        if (!summedMessageCounts[userID])
        {
          summedMessageCounts[userID] = 0
        }
        summedMessageCounts[userID] += messageCountsSegment[userID]
      }
    }

    let sortedSummedMessageCounts = []
    for (let userID of Object.keys(summedMessageCounts))
    {
      sortedSummedMessageCounts.push({id: userID, count: summedMessageCounts[userID]})
    }
    sortedSummedMessageCounts.sort((messageCount1, messageCount2) => messageCount2.count-messageCount1.count)

    let guild = await client.guilds.fetch(msg.guildId)

    let leaderboardMessage = "__** Leaderboard (" + (segmentSumType ? segmentSumType.name : (isAllTime ? "All-Time" : (segmentSumTimeRange.startString + " to " + segmentSumTimeRange.endString))) + ")**__"
    for (let messageCountPairIndex in sortedSummedMessageCounts)
    {
      leaderboardMessage += "\n"

      let userName = "[[RIP]]"
      let guildName

      let userID = sortedSummedMessageCounts[messageCountPairIndex].id

      try
      {
        guildName = (await guild.members.fetch(userID)).displayName
      }
      catch
      {}

      try
      {
        userName = (await client.users.fetch(userID)).username
      }
      catch {}

      let messageCount = sortedSummedMessageCounts[messageCountPairIndex].count
      leaderboardMessage += "**#" + (parseInt(messageCountPairIndex)+1) + "**  " + (guildName ? "<@" + userID + ">" : userName) + (guildName && userName != guildName ? " (aka *" + userName + "*)" : "") + " — *" + messageCount + "*"
    }
    msg.channel.send({
      "content": leaderboardMessage,
      "allowedMentions": { "users" : []}
    })

    return true
  }

  return false
}
