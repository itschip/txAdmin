//Requires
const modulename = 'WebServer:Settings-Save';
const fs = require('fs');
const slash = require('slash');
const path = require('path');
const { dir, log, logOk, logWarn, logError} = require('../../extras/console')(modulename);
const helpers = require('../../extras/helpers');

//Helper functions
const isUndefined = (x) => { return (typeof x === 'undefined') };

/**
 * Handle all the server control actions
 * @param {object} res
 * @param {object} req
 */
module.exports = async function action(res, req) {
    //Sanity check
    if(isUndefined(req.params.scope)){
        return res.status(400).send({type: 'danger', message: "Invalid Request"});
    }
    let scope = req.params.scope;

    //Check permissions
    if(!webUtils.checkPermission(req, 'settings.write', modulename)){
        return res.send({
            type: 'danger',
            message: `You don't have permission to execute this action.`
        });
    }

    //Delegate to the specific scope functions
    if(scope == 'global'){
        return handleGlobal(res, req);
    }else if(scope == 'fxserver'){
        return handleFXServer(res, req);
    }else if(scope == 'monitor'){
        return handleMonitor(res, req);
    }else if(scope == 'discord'){
        return handleDiscord(res, req);
    }else{
        return res.send({
            type: 'danger',
            message: 'Unknown settings scope.'
        });
    }
};


//================================================================
/**
 * Handle Global settings
 * @param {object} res
 * @param {object} req
 */
function handleGlobal(res, req) {
    //Sanity check
    if(
        isUndefined(req.body.serverName) ||
        isUndefined(req.body.publicIP) ||
        isUndefined(req.body.language) ||
        isUndefined(req.body.verbose)
    ){
        return res.status(400).send({type: 'danger', message: "Invalid Request - missing parameters"});
    }

    //Prepare body input
    let cfg = {
        serverName: req.body.serverName.trim(),
        publicIP: req.body.publicIP.trim(),
        language: req.body.language.trim(),
        verbose: (req.body.verbose === 'true')
    }

    //Trying to load language file
    let langPhrases;
    try {
        langPhrases = globals.translator.getLanguagePhrases(cfg.language);
    } catch (error) {
        return res.send({type: 'danger', message: `<strong>Language error:</strong> ${error.message}`});
    }

    //Preparing & saving config
    let newConfig = globals.configVault.getScopedStructure('global');
    newConfig.serverName = cfg.serverName;
    newConfig.publicIP = cfg.publicIP;
    newConfig.language = cfg.language;
    newConfig.verbose = cfg.verbose;
    let saveStatus = globals.configVault.saveProfile('global', newConfig);

    //Sending output
    if(saveStatus){
        globals.translator.refreshConfig(langPhrases);
        globals.config = globals.configVault.getScoped('global');
        let logMessage = `[${req.connection.remoteAddress}][${req.session.auth.username}] Changing global settings.`;
        logOk(logMessage);
        globals.logger.append(logMessage);
        return res.send({type: 'success', message: `<strong>Global configuration saved!</strong>`});
    }else{
        logWarn(`[${req.connection.remoteAddress}][${req.session.auth.username}] Error changing global settings.`);
        return res.send({type: 'danger', message: `<strong>Error saving the configuration file.</strong>`});
    }
}


//================================================================
/**
 * Handle FXServer settings
 * @param {object} res
 * @param {object} req
 */
function handleFXServer(res, req) {
    //Sanity check
    if(
        isUndefined(req.body.basePath) ||
        isUndefined(req.body.cfgPath) ||
        isUndefined(req.body.onesync) ||
        isUndefined(req.body.autostart) ||
        isUndefined(req.body.quiet)
    ){
        return res.status(400).send({type: 'danger', message: "Invalid Request - missing parameters"});
    }

    //Prepare body input
    let cfg = {
        basePath: slash(path.normalize(req.body.basePath+'/')),
        cfgPath: slash(path.normalize(req.body.cfgPath)),
        onesync: (req.body.onesync === 'true'),
        autostart: (req.body.autostart === 'true'),
        quiet: (req.body.quiet === 'true'),
    }

    //Validating path spaces
    if(
        cfg.basePath.includes(' ') ||
        cfg.cfgPath.includes(' ')
    ){
        return res.send({type: 'danger', message: `The paths cannot contain spaces.`});
    }

    //Validating Base Path
    try {
        if(!fs.existsSync(path.join(cfg.basePath, 'resources'))){
            if(cfg.basePath.includes('resources')){
                throw new Error("The base must be the folder that contains the resources folder.");
            }else{
                throw new Error("Couldn't locate or read a resources folder inside of the base path.");
            }
        }
    } catch (error) {
        return res.send({type: 'danger', message: `<strong>Base Path error:</strong> ${error.message}`});
    }

    //Validating CFG Path
    try {
        let cfgFilePath = helpers.resolveCFGFilePath(cfg.cfgPath, cfg.basePath);
        let rawCfgFile = helpers.getCFGFileData(cfgFilePath);
        let port = helpers.getFXServerPort(rawCfgFile);
    } catch (error) {
        return res.send({type: 'danger', message: `<strong>CFG Path error:</strong> ${error.message}`});
    }

    //Preparing & saving config
    let newConfig = globals.configVault.getScopedStructure('fxRunner');
    newConfig.basePath = cfg.basePath;
    newConfig.cfgPath = cfg.cfgPath;
    newConfig.onesync = cfg.onesync;
    newConfig.autostart = cfg.autostart;
    newConfig.quiet = cfg.quiet;
    let saveStatus = globals.configVault.saveProfile('fxRunner', newConfig);

    //Sending output
    if(saveStatus){
        globals.fxRunner.refreshConfig();
        let logMessage = `[${req.connection.remoteAddress}][${req.session.auth.username}] Changing fxRunner settings.`;
        logOk(logMessage);
        globals.logger.append(logMessage);
        return res.send({type: 'success', message: `<strong>FXServer configuration saved!</strong>`});
    }else{
        logWarn(`[${req.connection.remoteAddress}][${req.session.auth.username}] Error changing fxRunner settings.`);
        return res.send({type: 'danger', message: `<strong>Error saving the configuration file.</strong>`});
    }
}


//================================================================
/**
 * Handle Monitor settings
 * @param {object} res
 * @param {object} req
 */
function handleMonitor(res, req) {
    //Sanity check
    if(
        isUndefined(req.body.schedule)
    ){
        return res.status(400).send({type: 'danger', message: "Invalid Request - missing parameters"});
    }

    //Prepare body input
    let cfg = {
        schedule: req.body.schedule.split(',').map((x) => {return x.trim()})
    }

    //Validating times
    let times = helpers.parseSchedule(cfg.schedule, false);
    let invalidTimes = [];
    let validTimes = [];
    times.forEach((time) => {
        if(typeof time === 'string'){
            invalidTimes.push(`"${time}"`);
        }else{
            let cleanTime = time.hour.toString().padStart(2, '0') + ':' + time.minute.toString().padStart(2, '0');
            validTimes.push(cleanTime);
        }
    });
    if(invalidTimes.length){
        let message = `<strong>The following entries were not recognized as valid 24h times:</strong><br>`;
        message += invalidTimes.join('<br>\n');
        return res.send({type: 'danger', message: message});
    }

    //Preparing & saving config
    let newConfig = globals.configVault.getScopedStructure('monitor');
    newConfig.restarter.schedule = validTimes;
    let saveStatus = globals.configVault.saveProfile('monitor', newConfig);

    //Sending output
    if(saveStatus){
        globals.monitor.refreshConfig();
        let logMessage = `[${req.connection.remoteAddress}][${req.session.auth.username}] Changing monitor settings.`;
        logOk(logMessage);
        globals.logger.append(logMessage);
        return res.send({type: 'success', message: `<strong>Monitor/Restarter configuration saved!</strong>`});
    }else{
        logWarn(`[${req.connection.remoteAddress}][${req.session.auth.username}] Error changing monitor settings.`);
        return res.send({type: 'danger', message: `<strong>Error saving the configuration file.</strong>`});
    }
}


//================================================================
/**
 * Handle Discord settings
 * @param {object} res
 * @param {object} req
 */
function handleDiscord(res, req) {
    //Sanity check
    if(
        isUndefined(req.body.enabled) ||
        isUndefined(req.body.token) ||
        isUndefined(req.body.announceChannel) ||
        isUndefined(req.body.statusCommand)
    ){
        return res.status(400).send({type: 'danger', message: "Invalid Request - missing parameters"});
    }

    //Prepare body input
    let cfg = {
        enabled: (req.body.enabled === 'true'),
        token: req.body.token.trim(),
        announceChannel: req.body.announceChannel.trim(),
        statusCommand: req.body.statusCommand.trim()
    }

    //Preparing & saving config
    let newConfig = globals.configVault.getScopedStructure('discordBot');
    newConfig.enabled = cfg.enabled;
    newConfig.token = cfg.token;
    newConfig.announceChannel = (cfg.announceChannel.length)? cfg.announceChannel : false;
    newConfig.statusCommand = cfg.statusCommand;
    let saveStatus = globals.configVault.saveProfile('discordBot', newConfig);

    //Sending output
    if(saveStatus){
        globals.discordBot.refreshConfig();
        let logMessage = `[${req.connection.remoteAddress}][${req.session.auth.username}] Changing discordBot settings.`;
        logOk(logMessage);
        globals.logger.append(logMessage);
        return res.send({type: 'success', message: `<strong>Discord configuration saved!</strong>`});
    }else{
        logWarn(`[${req.connection.remoteAddress}][${req.session.auth.username}] Error changing discordBot settings.`);
        return res.send({type: 'danger', message: `<strong>Error saving the configuration file.</strong>`});
    }
}
