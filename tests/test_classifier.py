import csv
import tensorflow as tf
import tensorflow_hub as hub
import scipy.signal
from keras import layers, models


YAMNET_HANDLE = 'https://tfhub.dev/google/yamnet/1'
def load_wav_16k_mono(filename):
    """Loads a WAV file, converts it to 16kHz mono without tensorflow-io."""
    file_contents = tf.io.read_file(filename)
    wav, sample_rate = tf.audio.decode_wav(file_contents, desired_channels=1)
    wav = tf.squeeze(wav, axis=-1).numpy()
    sample_rate = int(sample_rate.numpy())

    # Resample audio to 16000Hz using scipy
    if sample_rate != 16000:
        num_samples = int(len(wav) * 16000 / sample_rate)
        wav = scipy.signal.resample(wav, num_samples)

    return tf.convert_to_tensor(wav, dtype=tf.float32)

def load_yamnet_class_names(yamnet_model):
    class_map_path = yamnet_model.class_map_path().numpy().decode('utf-8')
    class_names = []
    with tf.io.gfile.GFile(class_map_path) as csvfile:
        reader = csv.DictReader(csvfile)
        for row in reader:
            class_names.append(row['display_name'])
    return class_names

def build_classifier_head():
    model = models.Sequential([
        layers.Input(shape=(1024,), dtype=tf.float32, name='embedding'),
        layers.Dense(512, activation='relu'),
        layers.Dense(1, activation='sigmoid')
    ])
    model.compile(
        loss=tf.keras.losses.BinaryCrossentropy(),
        optimizer="adam",
        metrics=['accuracy']
    )
    return model

class ReduceMeanLayer(tf.keras.layers.Layer):
    def __init__(self, axis=0, **kwargs):
        super().__init__(**kwargs)
        self.axis = axis

    def call(self, input_tensor):
        return tf.math.reduce_mean(input_tensor, axis=self.axis)

if __name__ == "__main__":
    print("Initializing YAMNet from TensorFlow Hub...")
    yamnet = hub.load(YAMNET_HANDLE)
    
    print("Building Classifier Head...")
    classifier = build_classifier_head()
    classifier.summary()