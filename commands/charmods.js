const Command = require('../base/Command');
const mysql = require('mysql');
const moment = require('moment');
require('moment-duration-format');

class CharMods extends Command {
    constructor(client) {
        super(client, {
            name: 'charmods',
            category: "SWGoH",
            guildOnly: false,
            aliases: ['charactermods', 'cmods', 'mymods', 'cm'],
            permissions: ['EMBED_LINKS']
        });
    }

    async run(client, message, [userID, ...searchChar], level) { // eslint-disable-line no-unused-vars
        const stats = message.language.get('COMMAND_CHARMODS_STAT_NAMES');
        const types = message.language.get('COMMAND_CHARMODS_MOD_TYPES');
        const icons = {
            'STATMOD_SLOT_01': client.emojis.get('362066327101243392'),
            'STATMOD_SLOT_02': client.emojis.get('362066325474115605'),
            'STATMOD_SLOT_03': client.emojis.get('362066326925082637'),
            'STATMOD_SLOT_04': client.emojis.get('362066327168352257'),
            'STATMOD_SLOT_05': client.emojis.get('362066326996385812'),
            'STATMOD_SLOT_06': client.emojis.get('362066327516610570')
        };
        if (searchChar) searchChar = searchChar.join(' ');

        // Need to get the allycode from the db, then use that
        if (!userID) {
            return message.channel.send(message.language.get('BASE_SWGOH_MISSING_CHAR'));
        } else if (userID === "me") {
            userID = message.author.id;
        } else if (userID.match(/\d{17,18}/)) {
            userID = userID.replace(/[^\d]*/g, '');
        } else {
            // If they're just looking for a character for themselves, get the char
            searchChar = userID + ' ' + searchChar;
            searchChar = searchChar.trim();
            userID = message.author.id;
        }
        const chars = client.findChar(searchChar, client.characters);
        let character;
        if (!searchChar) {
            return message.channel.send(message.language.get('BASE_SWGOH_MISSING_CHAR'));
        }

        if (chars.length === 0) {
            return message.channel.send(message.language.get('BASE_SWGOH_NO_CHAR_FOUND', searchChar));
        } else if (chars.length > 1) {
            const charL = [];
            const charS = chars.sort((p, c) => p.name > c.name ? 1 : -1);
            charS.forEach(c => {
                charL.push(c.name);
            });
            return message.channel.send(message.language.get('BASE_SWGPH_CHAR_LIST', charL.join('\n')));
        } else {
            character = chars[0];
        }

        if (!client.users.get(userID)) {
            return message.channel.send(message.language.get('BASE_SWGOH_NO_USER'));
        }
        const ally = await client.allyCodes.findOne({where: {id: userID}});
        if (!ally) {
            return message.channel.send(message.language.get('BASE_SWGOH_NOT_REG', client.users.get(userID).tag));
        }
        const allyCode = ally.dataValues.allyCode;
        const connection = mysql.createConnection({
            host     : client.config.mySqlDB.host,
            user     : client.config.mySqlDB.user,
            password : client.config.mySqlDB.password,
            database : client.config.mySqlDB.database
        });
        connection.query(`CALL getCharMods(${allyCode}, "${character.uniqueName}");`, function(err, results) {
            if (!results) return message.channel.send(message.language.get('COMMAND_CHARMODS_NO_MODS', character.name));
            const res = results[0];
            let updated = res[0].updated;
            const slots = {};
            const name = res[0].uName;
            res.forEach(stat => {
                const slotN = stat.Slot;
                let statStr;
                if (stats[stat.statID].indexOf('%') > -1) {
                    statStr = stat.Value/100 + stats[stat.statID];
                } else {
                    statStr = parseInt(stat.Value/10000) + stats[stat.statID];
                }
                if (!slots[`${slotN}`]) {
                    slots[`${slotN}`] = {
                        stats: [],
                        type: '',
                        lvl: 0
                    };
                    slots[`${slotN}`].stats = [{
                        stat: statStr,
                        lastU: stat.updated
                    }];
                    slots[`${slotN}`].type = types[stat.Icon];
                    slots[`${slotN}`].lvl = stat.level;
                    if (moment(updated).unix() < moment(stat.updated).unix()) updated = stat.updated;
                } else {
                    slots[`${slotN}`].stats.push({
                        stat: statStr,
                        lastU: stat.updated    
                    });
                }
            });
            const lastUpdated = moment.duration(Math.abs(moment(updated).diff(moment()))).format("d [days], h [hrs], m [min]");

            const fields = [];
            Object.keys(icons).forEach(slot => {
                if (slots[slot]) {
                    const sTime = {};
                    slots[slot].stats.forEach(s => {
                        const t = moment(s.lastU).unix();
                        if (!sTime[t]) {
                            sTime[t] = [s.stat];
                        } else {
                            sTime[t].push(s.stat);
                        }
                    });
                    const win = Math.max(...Object.keys(sTime));
                    const sl = sTime[win];
                    fields.push({
                        name: `${icons[slot]} ${slots[slot].type} Mod  (Lvl: ${slots[slot].lvl})`,
                        value: `**${sl.shift()}**\n${sl.join('\n')}\n\`${'-'.repeat(28)}\``,
                        inline: true
                    });
                }
            });

            message.channel.send({embed: {
                author: {
                    name: `${name}'s ${character.name}`,
                    icon_url: character.avatarURL
                },
                fields: fields,
                footer: {
                    text: message.language.get('COMMAND_CHARMODS_LAST_UPDATED', lastUpdated)
                }
            }});
        });
        connection.end();
    }
}

module.exports = CharMods;
