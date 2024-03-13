const HotPocket = require('hotpocket-nodejs-contract');
const fs = require('fs').promises;

class University {

    // Wired functions.
    sendOutput;
    getHPConfigs;
    getUNL;
    sendNPL;

    async readRecord(filename) {
        try {
            const output = JSON.parse(await fs.readFile(filename));
            return { type: 'data_result', data: output };
        }
        catch (err) {
            console.log(err);
            return { type: 'error', error: 'No records found.' };
        }
    }

    async clear(filename) {
        try {
            await fs.unlink(filename);
        } catch (e) {
            return { type: 'error', error: 'Error occurred clearing record.' };
        }
        return { type: 'data_result', data: 'Cleared record.' };
    }

    
    async createRecord(record, filename) {
        try {
            const recordString = JSON.stringify(record);
            await fs.writeFile(filename, recordString);
            return { type: 'data_result', data: 'success' };
        } catch (err) {
            console.log(err);
            return { type: 'error', error: 'Error occurred while recording.' };
        }
    }


    /**
     * Handles incoming calculator command calls.
     * @param {object} user The user/client related to the command execution.
     * @param {object} command The executed command.
     * @param {boolean} isReadOnly Whether this is contract invocation or not.
     */
    async handleCommand(user, command, isReadOnly) {


        console.log("### handleCommand: ", command);
        console.log("### isReadOnly: ", isReadOnly);
        // const userPublicKey = user.publicKey;
        // const filename = `${user.publicKey}.log`;
        let response = null;

        if (isReadOnly && command.type != 'READ_RECORD') {
            await this.sendOutput(user, {
                type: 'error',
                error: this.commands.includes(command.type) ? 'Command is not supported in read-only mode.' : 'Invalid input provided.'
            });
        }
        else if (command.type == 'CREATE_RECORD' || command.type == 'UPDATE_RECORD') {
            console.log("### In create record");
            const record = command.record;
            const uri = command.uri;
            const filename = `${uri}.log`;
            console.log("### filename: ", filename);
            response = await this.createRecord(record, filename);
            console.log("### response: ", response);
            await this.sendOutput(user, response);
        } 
        else if (command.type == 'READ_RECORD') {
            console.log("### In read record");
            const uri = command.uri;
            const filename = `${uri}.log`;
            console.log("### filename: ", filename);
            response = await this.readRecord(filename);
            console.log("### response: ", response);
            await this.sendOutput(user, response);

        }
        else if (command.type == 'DELETE_RECORD') {
            console.log("### In read record");
            const uri = command.uri;
            const filename = `${uri}.log`;
            console.log("### filename: ", filename);
            response = await this.clear(filename);
            console.log("### response: ", response);
            await this.sendOutput(user, response);
        }
        else {
            await this.sendOutput(user, {
                type: 'error',
                error: 'Invalid input provided.'
            })
        }
    }
}


/**
 * HotPocket smart contract is defined as a function which takes the HotPocket contract context as an argument.
 * This function gets invoked every consensus round and whenever a user sends a out-of-consensus read-request.
 */
async function contract(ctx) {

    // Create our application logic component.
    // This pattern allows us to test the application logic independently of HotPocket.
    const university = new University();

    // Wire-up output emissions from the calculator application before we pass user inputs to it.
    university.sendOutput = async (user, output) => {
        await user.send(output)
    }

    // Wire-up HotPocket configuration info acquisitions.
    university.getHPConfigs = async () => {
        return await ctx.getConfig();
    }

    // Wire-up HotPocket UNL acquisitions.
    university.getUNL = () => {
        return ctx.unl;
    }

    // Wire-up HotPocket NPL channel usage.
    university.sendNPL = async (message) => {
        await ctx.unl.send(message);
    }

    // In 'readonly' mode, nothing our contract does will get persisted on the ledger. The benefit is
    // readonly messages gets processed much faster due to not being subjected to consensus.
    // We should only use readonly mode for returning/replying data for the requesting user.
    //
    // In consensus mode (NOT read-only), we can do anything like persisting to data storage and/or
    // sending data to any connected user at the time. Everything will get subjected to consensus so
    // there is a time-penalty.
    const isReadOnly = ctx.readonly;

    console.log("### Connected users", ctx.users.count());
    // Process user inputs.
    // Loop through list of users who have sent us inputs.
    for (const user of ctx.users.list()) {

        // Loop through inputs sent by each user.
        for (const input of user.inputs) {

            // Read the data buffer sent by user (this can be any kind of data like string, json or binary data).
            const buf = await ctx.users.read(input);

            // Let's assume all data buffers for this contract are JSON.
            // In real-world apps, we need to gracefully filter out invalid data formats for our contract.
            const command = JSON.parse(buf);

            // Pass the JSON message to our application logic component.
            await university.handleCommand(user, command, isReadOnly);
        }
    }
}

const hpc = new HotPocket.Contract();
hpc.init(contract);