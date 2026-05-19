require("dotenv").config();

const OpenAI = require("openai").default;

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_API_BASE,
});

async function main() {
  try {
    const response = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL,
      messages: [
        {
          role: "user",
          content: "Hello",
        },
      ],
    });

    console.log(response.choices[0].message.content);
  } catch (error) {
    console.error(error);
  }
}

main();
