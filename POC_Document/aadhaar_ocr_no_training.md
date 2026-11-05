# Zoho Creator: Aadhaar OCR Auto-Fill (No Training Required)

This guide outlines how to extract a First Name and Last Name from an uploaded Aadhaar card image and auto-populate them in real-time, **without training a custom AI model**. 

This method uses Zoho's standard, ready-to-use OCR field combined with an "On User Input" Deluge script.

## Step 1: Configure the Form Fields

1. Open your Form Builder.
2. Drag and drop an **Image** field and name it `Aadhaar_Photo`.
3. Drag and drop two **Single Line** fields and name them `First_Name` and `Last_Name`.
4. Go to the **AI Fields** section on the left panel and drag the standard **OCR Field** onto your form. Name it `Raw_OCR_Text`.
5. In the properties of the `Raw_OCR_Text` field on the right panel, set the **Source field** to `Aadhaar_Photo`. 
6. *(Optional)* Hide the `Raw_OCR_Text` field in the field properties so the user doesn't see the messy raw text block.

## Step 2: Add the Auto-Fill Deluge Script

We need a script that triggers the moment the built-in OCR finishes reading the card. 

1. Go to **Workflows** -> **Form Workflows**.
2. Create a new workflow. Select **Field Actions** -> **On User Input**.
3. Select the `Raw_OCR_Text` field. *(This means the script will run the split-second the AI populates this field with the scanned text).*
4. Paste the following boilerplate code:

```deluge
// Ensure the OCR actually extracted something
if(input.Raw_OCR_Text != null && input.Raw_OCR_Text != "")
{
    // Split the massive block of raw text into individual lines
    lines = input.Raw_OCR_Text.toList("\n");
    fullName = "";
    
    // Loop through each line to find the person's name
    for each line in lines
    {
        cleanLine = line.trim();
        
        // 1. Skip standard government headers found on all Aadhaar cards
        if(cleanLine.containsIgnoreCase("Government") || cleanLine.containsIgnoreCase("India") || cleanLine.containsIgnoreCase("Aadhaar") || cleanLine.containsIgnoreCase("Father"))
        {
            continue;
        }
        
        // 2. Heuristic: The Name is usually the first clean line of text that doesn't contain numbers or "DOB"
        if(!cleanLine.containsIgnoreCase("DOB") && !cleanLine.containsIgnoreCase("Year") && !cleanLine.contains("1") && !cleanLine.contains("9") && cleanLine.length() > 2)
        {
            fullName = cleanLine;
            break;
        }
    }
    
    // 3. If a name was found, split it into First and Last Name and update the form live
    if(fullName != "")
    {
        nameParts = fullName.toList(" ");
        
        // First word is First Name
        input.First_Name = nameParts.get(0);
        
        // Last word is Last Name (handles middle names by just grabbing the very end)
        input.Last_Name = if(nameParts.size() > 1, nameParts.get(nameParts.size() - 1), "");
    }
}
```

## How this works for the user:

1. The user uploads their image to the `Aadhaar_Photo` field.
2. Zoho's pre-built AI instantly scans it and dumps all the text into the `Raw_OCR_Text` field.
3. The moment that text drops in, your "On User Input" script triggers, finds the line that looks like a name, splits it, and magically populates `First_Name` and `Last_Name` before the user even clicks the Submit button.