from PIL import Image
import os

def make_transparent():
    image_path = 'assets/shotglass.png'
    if not os.path.exists(image_path):
        print("Error: assets/shotglass.png not found. Please copy the file first.")
        return
        
    img = Image.open(image_path)
    img = img.convert("RGBA")
    
    datas = img.getdata()
    new_data = []
    
    # We want a smooth transparency gradient near the edges.
    threshold = 25
    
    for item in datas:
        r, g, b, a = item
        brightness = max(r, g, b)
        if brightness < threshold:
            # Scale alpha smoothly from 0 to 255
            alpha = int((brightness / float(threshold)) * 255)
            new_data.append((r, g, b, alpha))
        else:
            new_data.append((r, g, b, 255))
            
    img.putdata(new_data)
    img.save(image_path, "PNG")
    print("Success")

if __name__ == '__main__':
    make_transparent()
