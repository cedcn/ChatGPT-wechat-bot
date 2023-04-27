import { WechatyBuilder } from "wechaty";
import qrcodeTerminal from "qrcode-terminal";
import fetch from "node-fetch";
import config from "./config.js";

let bot: any = {};
const startTime = new Date();
initProject();

async function getChatGPTReply(content: any, contactId: any) {
  const controller = new AbortController();
  const response = await fetch("https://chat.jinshuju.org/api/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messages: {
        role: "user",
        content: content,
      },
      prompt: "我的名字叫航航，今年8岁了，我是一个无所不能的小朋友",
      temperature: 0.5,
      model: "3.5",
    }),
    signal: controller.signal,
  });

  if (!response.ok) {
    return;
  }

  const stream = response.body;

  if (!stream) {
    return;
  }

  return new Promise((resolve, reject) => {
    let chunks: any[] = [];
    stream.on("readable", () => {
      let chunk;
      while (null !== (chunk = stream.read())) {
        chunks.push(chunk);
      }
    });

    stream.on("end", () => {
      const data = Buffer.concat(chunks).toString();
      resolve(data);
    });

    stream.on("error", (error) => {
      reject(error);
    });
  });
}

async function replyMessage(contact: any, content: any) {
  const { id: contactId } = contact;
  try {
    if (
      content.trim().toLocaleLowerCase() === config.resetKey.toLocaleLowerCase()
    ) {
      await contact.say("对话已被重置");
      return;
    }
    const message = await getChatGPTReply(content, contactId);

    if (
      (contact.topic && contact?.topic() && config.groupReplyMode) ||
      (!contact.topic && config.privateReplyMode)
    ) {
      const result = content + "\n-----------\n" + message;
      await contact.say(result);
      return;
    } else {
      await contact.say(message);
    }
  } catch (e: any) {
    console.error(e);
    if (e.message.includes("timed out")) {
      await contact.say(
        content +
          "\n-----------\nERROR: Please try again, ChatGPT timed out for waiting response."
      );
    }
  }
}

async function onMessage(msg: any) {
  // 避免重复发送
  if (msg.date() < startTime) {
    return;
  }
  const contact = msg.talker();
  const receiver = msg.to();
  const content = msg.text().trim();
  const room = msg.room();

  const alias = (await contact.alias()) || (await contact.name());
  const isText = msg.type() === bot.Message.Type.Text;
  if (msg.self()) {
    return;
  }

  if (room && isText) {
    const topic = await room.topic();
    console.log(
      `Group name: ${topic} talker: ${await contact.name()} content: ${content}`
    );

    const pattern = RegExp(`^@${receiver.name()}\\s+${config.groupKey}[\\s]*`);
    if (await msg.mentionSelf()) {
      if (pattern.test(content)) {
        const groupContent = content.replace(pattern, "");
        replyMessage(room, groupContent);
        return;
      } else {
        console.log(
          "Content is not within the scope of the customizition format"
        );
      }
    }
  } else if (isText) {
    console.log(`talker: ${alias} content: ${content}`);
    if (content.startsWith(config.privateKey) || config.privateKey === "") {
      let privateContent = content;
      if (config.privateKey === "") {
        privateContent = content.substring(config.privateKey.length).trim();
      }
      replyMessage(contact, privateContent);
    } else {
      console.log(
        "Content is not within the scope of the customizition format"
      );
    }
  }
}

function onScan(qrcode: any) {
  qrcodeTerminal.generate(qrcode, { small: true }); // 在console端显示二维码
  const qrcodeImageUrl = [
    "https://api.qrserver.com/v1/create-qr-code/?data=",
    encodeURIComponent(qrcode),
  ].join("");

  console.log(qrcodeImageUrl);
}

async function onLogin(user: any) {
  console.log(`${user} has logged in`);
  const date = new Date();
  console.log(`Current time:${date}`);
}

function onLogout(user: any) {
  console.log(`${user} has logged out`);
}

async function initProject() {
  try {
    bot = WechatyBuilder.build({
      name: "WechatEveryDay",
      puppet: "wechaty-puppet-wechat", // 如果有token，记得更换对应的puppet
      puppetOptions: {
        uos: true,
      },
    });

    bot
      .on("scan", onScan)
      .on("login", onLogin)
      .on("logout", onLogout)
      .on("message", onMessage);

    bot
      .start()
      .then(() => console.log("Start to log in wechat..."))
      .catch((e: any) => console.error(e));
  } catch (error) {
    console.log("init error: ", error);
  }
}
