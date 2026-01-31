const input = document.getElementsByClassName("input");
const output = document.getElementById("output");
const multipleCommands = document.getElementById("checkbox");
const addButton = document.getElementById("moreInputs");
const removeButton = document.getElementById("lessInputs");
const inputDiv = document.getElementById("inputFields");
const genButton = document.getElementById("genCommand");
const buttonSFX = document.getElementById("buttonClick");
const checkboxSFX = document.getElementById("checkboxClick")
const newmoon = document.getElementById("newmoon");

let numInputs = 0;


addButton.addEventListener("click", async () => {
    numInputs += 1;
    let newInput = document.createElement('textarea');
    newInput.classList.add("input");
    newInput.id = numInputs;
    newInput.placeholder="Command " + (numInputs + 1) + " goes here...";
    inputDiv.appendChild(newInput);
});

removeButton.addEventListener("click", async () => {
    let removeMe = document.getElementById(numInputs);
    removeMe.remove();
    numInputs -= 1;
});

addButton.disabled = true;
removeButton.disabled = true;

multipleCommands.addEventListener("click", async () => {

    checkboxSFX.currentTime = 0;
    checkboxSFX.play();

    if(multipleCommands.checked){
        addButton.disabled = false;
        removeButton.disabled = false;
        addButton.classList.remove("disabled");
        removeButton.classList.remove("disabled");
    }
    else{
        addButton.disabled = true;
        removeButton.disabled = true;
        addButton.classList.add("disabled");
        removeButton.classList.add("disabled");
        while(input.length > 1){
            let removeMe = document.getElementById(numInputs);
            removeMe.remove();
            numInputs -= 1;
        }
    }
});

genButton.addEventListener("click", async () => {
     const values = Array.from(input)
        .map(el => el.value.trim())
        .filter(v => v !== "");

    // If nothing to send, bail early
    if (values.length === 0) return;

    buttonSFX.currentTime = 0;
    buttonSFX.play();

    let data = {}
    for(let i = 0; i < input.length; i++){
        data["input"+(i+1)] = input[i].value;
    }
    console.log(data);
    try{
        const res = await fetch("/genTag", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data)
        });

        const responseData = await res.json();

        console.log(responseData)

        output.textContent = responseData;

        console.log("response status: ", res);
    } catch (e) {
        console.log("fetch error: ",e);
    }
});

newmoon.addEventListener("click", async () => {
    window.location.href = "https://nyxxusnovum.tv"
})
