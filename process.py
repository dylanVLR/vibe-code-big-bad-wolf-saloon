import os
from PIL import Image

def remove_white_bg(img_path, out_path):
    print(f"Processing {img_path}")
    try:
        img = Image.open(img_path).convert("RGBA")
        datas = img.getdata()

        newData = []
        for item in datas:
            # Change white (also shades of white/light gray) to transparent
            if item[0] > 240 and item[1] > 240 and item[2] > 240:
                newData.append((255, 255, 255, 0))
            else:
                newData.append(item)

        img.putdata(newData)
        img.save(out_path, "PNG")
        print(f"Saved {out_path}")
    except Exception as e:
        print(f"Error: {e}")

base_dir = os.path.expanduser('~/.gemini/antigravity-ide/brain/c2252387-61ff-491e-bf75-d52ad56020d6')
reel_img = os.path.join(base_dir, 'wolf_reel_cartoony_1780090209240.png')
bonus_img = os.path.join(base_dir, 'wolf_bonus_cartoony_1780090221341.png')

remove_white_bg(reel_img, 'assets/wolf_reel.png')
remove_white_bg(bonus_img, 'assets/wolf_bonus.png')
