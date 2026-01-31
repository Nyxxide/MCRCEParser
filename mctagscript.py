from flask import Flask, render_template, jsonify, request
app = Flask(__name__)

def buildTag(commandSet):
    tag = "{cmd:\""
    if len(commandSet) > 1:
        tag += "/summon minecraft:falling_block ~ ~1 ~ {BlockState:{Name:\'minecraft:activator_rail\'},Time:1,Passengers:["
        for index, command in enumerate(commandSet):
            tag += "{id:\'minecraft:command_block_minecart\',Command:\'" + command + "\'},"
        tag += "{id:\'minecraft:command_block_minecart\',Command:\'kill @e[type=minecraft:command_block_minecart,distance=..2]\'}]}\"}"
    elif len(commandSet) == 1:
        tag += commandSet[0] + "\"}"

    return tag

@app.route('/')
def home():
    return render_template('index.html')

@app.post("/genTag")
def genTag():
    data = request.get_json()
    iterable = data.values()
    commandSet = []
    for command in iterable:
        if not isinstance(command, str):
            continue
        command = command.strip()
        if not command:
            continue
        if command.startswith("/"):
            command = command[1:]
        command = command.replace('\'', '\\\\\\\'').replace('\"', "\\\\\\\"")
        commandSet.append(command)

        #do other stuff
    result = buildTag(commandSet)

    return jsonify(result)

if __name__ == '__main__':
    app.run(host='127.0.0.1', port=5001 ,debug=True)