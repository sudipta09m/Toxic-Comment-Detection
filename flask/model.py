from transformers import AutoTokenizer, AutoModelForSequenceClassification
import torch

# This is the name of the model on Hugging Face.
model_name = "JungleLee/bert-toxic-comment-classification"

# 1. Load the Tokenizer
# The tokenizer prepares your text (like "I hate you") into a format
# the model understands (like [101, 1045, 3223, 2017, 102]).
tokenizer = AutoTokenizer.from_pretrained(model_name)

# 2. Load the Model
# This loads the 438MB file (pytorch_model.bin) and its config.
model = AutoModelForSequenceClassification.from_pretrained(model_name)

print("Model loaded successfully!\n")

#1.savve all the files to a new folder 
save_directory = "./toxic_comment_model"
model.save_pretrained(save_directory)
tokenizer.save_pretrained(save_directory)
print(f"Model and tokenizer saved to {save_directory}\n")